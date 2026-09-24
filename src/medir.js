import { crearClienteAdo } from './ado/client.js';
import { descubrirAdjuntos, aWorkItem } from './fuentes/adjuntos.js';
import { descubrirRepoEnAdo, REPO_POR_DEFECTO, RAMA_POR_DEFECTO, CARPETA_POR_DEFECTO } from './fuentes/repoAdo.js';
import { reconciliar } from './reconciliador/index.js';
import { medirAmbiente } from './db/ejecutar.js';
import { validarEscalera } from './desvios/escalera.js';
import { construirReporte } from './reporte.js';
import { rolesDesde } from './roles.js';
import { unificarPersonas } from './identidades.js';
import { medirStageToDev, sumarDelSprint } from './stageToDev.js';
import { ordenarParaEjecucion } from './reconciliador/index.js';
import { marcarEnMain } from './enMain.js';

export const OPCIONES_POR_DEFECTO = { ambientes: ['dev', 'stage'], destino: 'stage' };

// Rama que el equipo trata como "ya corrio en produccion". No es master: Api.Net tiene las
// dos, y master NO es el destino de promocion (los PR de StageToMain van a main).
export const RAMA_MAIN_POR_DEFECTO = 'main';

// De donde sale el lado REPO de la comparacion. Se lee de Azure, no del disco: obligar a
// tener el Api.Net clonado y al dia era la unica dependencia que quedaba para instalar esto
// en la maquina de cualquiera.
export function opcionesDelRepo(env = process.env) {
  return {
    repo: env.DEPLOY_BOARD_REPO_SCRIPTS || REPO_POR_DEFECTO,
    rama: env.DEPLOY_BOARD_RAMA_SCRIPTS || RAMA_POR_DEFECTO,
    ramaMain: env.DEPLOY_BOARD_RAMA_MAIN || RAMA_MAIN_POR_DEFECTO,
  };
}

// Una sola barrida, dos consumidores: la consola y el servidor local. Antes esto vivia dentro
// de main() en cli.js, y un servidor que quisiera re-medir tenia que volver a escribirla —
// dos copias de la misma secuencia se desincronizan en el primer cambio.
//
// Los avisos se DEVUELVEN en vez de imprimirse: un aviso que solo existe como console.error
// no puede llegar a una pantalla. Quien llama decide si van a stderr o a la UI.
export async function medirTodo(opciones = {}, deps = {}) {
  const o = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const env = deps.env || process.env;
  const ado = deps.ado || crearClienteAdo(env);
  const avisos = [];

  const { scripts: adjuntos, wis, tasks, respaldos } = await descubrirAdjuntos(ado, o.iteracion);

  // No se ocultan en silencio: si el equipo dejo respaldos __OLD/__NEW adjuntos, el aviso dice
  // cuantos y cuales, para que no se lean como "desaparecieron" del reporte.
  if (respaldos.length) {
    const nombres = respaldos.slice(0, 5).map((r) => r.archivo).join(', ');
    const resto = respaldos.length > 5 ? '…' : '';
    avisos.push(`Se dejaron afuera ${respaldos.length} respaldos (__OLD/__NEW) adjuntos: no se ejecutan, no son scripts del sprint. ${nombres}${resto}`);
  }

  // El lado del REPO es opcional, pero su ausencia no puede pasar callada: sin el, los
  // desvios de "esta en la tarjeta y no en el repo" (y al reves) no pueden dispararse, y una
  // lista sin esos desvios se lee como "todo coincide" cuando en realidad no se comparo nada.
  const delRepo = opcionesDelRepo(env);
  const descubrir = deps.descubrirRepo || descubrirRepoEnAdo;
  let repo = [];
  // El lado de main solo tiene sentido si hay carpeta de sprint elegida: sin eso no hay con
  // que comparar de ningun lado, y ademas duplicaria el aviso de arriba. `ramaMainUsada` queda
  // en null salvo que la lectura de main haya contestado de verdad — asi la pantalla distingue
  // "no se evaluo" (aviso, sprint sin elegir, o la lectura fallo) de "se evaluo y no encontro".
  let archivosDeMain = null;
  let ramaMainUsada = null;
  if (!o.sprint) {
    avisos.push('No se comparo contra el repo: no hay carpeta del sprint elegida (ni en pantalla ni en DEPLOY_BOARD_SPRINT). Los desvios de script faltante o sobrante NO se pueden detectar.');
  } else {
    try {
      repo = await descubrir(ado, { sprint: o.sprint, ...delRepo });
      if (!repo.length) {
        avisos.push(`No encontre scripts en ${delRepo.repo}, rama ${delRepo.rama}, carpeta del sprint "${o.sprint}". Revisa DEPLOY_BOARD_SPRINT y DEPLOY_BOARD_RAMA_SCRIPTS: los desvios de script faltante o sobrante NO se pueden detectar sin eso.`);
      }
    } catch (e) {
      // Que falle el lado del repo no puede tumbar la medicion de los ambientes, que es lo
      // que decide si se sube o no. Pero tampoco puede pasar callado.
      avisos.push(`No pude leer ${delRepo.repo} de Azure (${e.message}). Los desvios de script faltante o sobrante NO se pueden detectar en esta corrida.`);
    }

    // Segunda lectura de la MISMA carpeta, pero en la rama main: es lo unico que distingue
    // "Ya en rama MAIN" (hecho, cuenta como subido) de "En MAIN, pero otra version" (el
    // contenido que va a subir no es el que ya esta ahi). Que falle no puede tumbar el resto
    // de la medicion — es un dato mas, no el motivo por el que se mide.
    try {
      archivosDeMain = await descubrir(ado, { sprint: o.sprint, repo: delRepo.repo, rama: delRepo.ramaMain });
      ramaMainUsada = delRepo.ramaMain;
    } catch (e) {
      avisos.push(`No pude leer la rama main de ${delRepo.repo} (${e.message}): 'Ya en rama MAIN' no se evaluo.`);
    }
  }

  const scripts = reconciliar({ adjuntos, repo });

  // Un script puede nombrar un work item de OTRA iteracion (el [B-25038] adjunto a una task del
  // sprint cuyo bug quedo en otro sprint). La consulta del sprint no lo trae y la fila salia sin
  // estado ni titulo, que se lee como "no existe". Se piden todos juntos, en una llamada.
  const conocidos = new Set(wis.map((w) => w.id));
  const faltan = [...new Set(scripts.map((s) => s.wiId).filter((id) => id != null && !conocidos.has(id)))].sort((a, b) => a - b);
  if (faltan.length) {
    try {
      for (const item of await ado.getWorkItems(faltan)) wis.push({ ...aWorkItem(item), fueraDelSprint: true });
    } catch (e) {
      avisos.push(`No pude traer ${faltan.length} work items fuera del sprint (${e.message}): esas filas quedan sin estado, y sus scripts pueden figurar como bloqueantes (D2/D3) aunque esten cerrados o pausados.`);
    }
  }

  // Una persona llega con un nombre por fuente (Azure, su git local, el .env) y la pantalla
  // la partia en varias. Las firmas del repo son el material para unirlas; si no se pueden
  // leer, se une con lo que haya y se avisa.
  let autores = [];
  if (ado.autoresDe) {
    try {
      autores = await ado.autoresDe(delRepo.repo, CARPETA_POR_DEFECTO, delRepo.rama);
    } catch (e) {
      avisos.push(`No pude leer los autores de ${delRepo.repo} (${e.message}): una misma persona puede aparecer con dos nombres en los pendientes.`);
    }
  }
  const roles = unificarPersonas({ wis, scripts, roles: rolesDesde(env), autores });

  const enMain = archivosDeMain ? marcarEnMain(scripts, archivosDeMain) : {};

  const medir = deps.medirAmbiente || medirAmbiente;
  const estados = {};
  for (const amb of o.ambientes) {
    const medido = await medir(scripts, amb, { env });
    for (const [id, v] of Object.entries(medido)) (estados[id] ||= {})[amb] = v;
  }

  const reporte = construirReporte({
    scripts, wis, tasks, estados,
    destino: o.destino, ambientes: o.ambientes,
    roles,
    enMain, ramaMain: ramaMainUsada,
  });

  // El pase stage -> dev va aparte del sprint: compara las ramas, no una carpeta. Que falle no
  // puede tumbar la medicion del sprint, pero tampoco pasar callado — una pestaña vacia se lee
  // como "dev esta al dia".
  reporte.stageToDev = null;
  if (ado.diffEntreRamas) {
    const ramaStage = env.DEPLOY_BOARD_RAMA_STAGE || undefined;
    try {
      const s2d = await medirStageToDev(ado, { repo: delRepo.repo, ramaStage, ramaDev: delRepo.rama }, { medirAmbiente: medir, env });
      const todo = sumarDelSprint(s2d, scripts, estados);
      reporte.stageToDev = { ramaStage: todo.ramaStage, ramaDev: todo.ramaDev, orden: ordenarParaEjecucion(todo.scripts), estados: todo.estados, origen: todo.origen };
    } catch (e) {
      const causa = e.cause && (e.cause.code || e.cause.message);
      avisos.push(`No pude comparar la rama de stage contra ${delRepo.rama} (${e.message}${causa ? ': ' + causa : ''}): la pestaña stage → dev no se evaluó.`);
    }
  }

  // Lo que no se midio se dice: sin estos avisos, una lista sin D3/D4 se lee como "no falta
  // ningun PRE" cuando en realidad no se pregunto. Cuando el destino ES stage, D3 y D4 dependen
  // del MISMO ambiente sin medir: dos avisos que arrancan los dos con "No se midio stage"
  // suenan a error de tipeo repetido, asi que van fusionados en uno solo.
  if (o.destino === 'stage') {
    if (!o.ambientes.includes('stage')) {
      avisos.push('No se midio stage: los PRE que falten (D3) y los work items dados por testeados con scripts sin correr (D4) no se evaluaron.');
    }
  } else {
    if (!o.ambientes.includes(o.destino)) {
      avisos.push(`No se midio ${o.destino}: los PRE que falten ahi (D3) no se evaluaron.`);
    }
    if (!o.ambientes.includes('stage')) {
      avisos.push('No se midio stage: los work items dados por testeados con scripts sin correr (D4) no se evaluaron.');
    }
  }

  // La escalera se valida contra la lista REAL de estados de ADO, no solo contra los que
  // aparecieron en este sprint: asi un estado nuevo del proceso se avisa ANTES de que llegue
  // a una tarjeta, no despues. Si ADO no contesta, se cae a los observados — un aviso menos
  // completo es preferible a que el reporte entero falle por un chequeo accesorio.
  const tipos = [...new Set(wis.map((w) => w.tipo).filter(Boolean))];
  let estadosDelProceso = [...new Set([...wis, ...tasks].map((x) => x.estado).filter(Boolean))];
  // Por tipo y no con Promise.all: las llamadas son independientes, y con Promise.all un solo
  // tipo que falle descarta TAMBIEN las listas que si volvieron. Una respuesta parcial es
  // estrictamente mejor que ninguna, y el tipo que fallo se nombra en vez de desaparecer.
  const tiposSinLista = [];
  for (const t of tipos) {
    try {
      estadosDelProceso = [...new Set([...estadosDelProceso, ...(await ado.listarEstados(t))])];
    } catch {
      tiposSinLista.push(t);
    }
  }
  if (tiposSinLista.length) {
    avisos.push(`No pude leer la lista de estados de ADO para: ${tiposSinLista.join(', ')}. Para esos tipos valido solo los observados en este sprint.`);
  }
  const desconocidos = validarEscalera(estadosDelProceso);
  if (desconocidos.length) {
    avisos.push(`Estados que la escalera no conoce (no disparan D1 ni D4): ${desconocidos.join(', ')}`);
  }

  return { reporte, avisos, opciones: o };
}
