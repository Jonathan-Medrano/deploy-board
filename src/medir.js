import { crearClienteAdo } from './ado/client.js';
import { descubrirAdjuntos } from './fuentes/adjuntos.js';
import { descubrirRepoEnAdo, REPO_POR_DEFECTO, RAMA_POR_DEFECTO } from './fuentes/repoAdo.js';
import { reconciliar } from './reconciliador/index.js';
import { medirAmbiente } from './db/ejecutar.js';
import { validarEscalera } from './desvios/escalera.js';
import { construirReporte } from './reporte.js';
import { rolesDesde } from './roles.js';

export const OPCIONES_POR_DEFECTO = { ambientes: ['dev', 'stage'], destino: 'stage' };

// De donde sale el lado REPO de la comparacion. Se lee de Azure, no del disco: obligar a
// tener el Api.Net clonado y al dia era la unica dependencia que quedaba para instalar esto
// en la maquina de cualquiera.
export function opcionesDelRepo(env = process.env) {
  return {
    repo: env.DEPLOY_BOARD_REPO_SCRIPTS || REPO_POR_DEFECTO,
    rama: env.DEPLOY_BOARD_RAMA_SCRIPTS || RAMA_POR_DEFECTO,
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

  const { scripts: adjuntos, wis, tasks } = await descubrirAdjuntos(ado, o.iteracion);

  // El lado del REPO es opcional, pero su ausencia no puede pasar callada: sin el, los
  // desvios de "esta en la tarjeta y no en el repo" (y al reves) no pueden dispararse, y una
  // lista sin esos desvios se lee como "todo coincide" cuando en realidad no se comparo nada.
  const delRepo = opcionesDelRepo(env);
  const descubrir = deps.descubrirRepo || descubrirRepoEnAdo;
  let repo = [];
  if (!o.sprint) {
    avisos.push('No se comparo contra el repo: falta DEPLOY_BOARD_SPRINT (la carpeta del sprint dentro de DB_Migrations). Los desvios de script faltante o sobrante NO se pueden detectar.');
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
  }

  const scripts = reconciliar({ adjuntos, repo });

  const medir = deps.medirAmbiente || medirAmbiente;
  const estados = {};
  for (const amb of o.ambientes) {
    const medido = await medir(scripts, amb, { env });
    for (const [id, v] of Object.entries(medido)) (estados[id] ||= {})[amb] = v;
  }

  const reporte = construirReporte({
    scripts, wis, tasks, estados,
    destino: o.destino, ambientes: o.ambientes,
    roles: rolesDesde(env),
  });

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
