import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { medirTodo } from './medir.js';
import { construirVista } from './vista.js';
import { crearAlmacen, ArchivoDanado, VersionVieja } from './almacen.js';
import { aplicarDecisiones, aplicarCambioDecision, claveDeSprint, desviosResueltos, normalizarDecisiones } from './decisiones.js';
import { estadoDelRepo, traerCambios } from './actualizador.js';
import { sprintsDisponibles } from './sprints-ado.js';
import { fechaLocal } from './fecha.js';
import { crearProgreso, conProgreso } from './progreso.js';
import { PUERTO_POR_DEFECTO } from './entorno.js';
import { crearClienteAdo } from './ado/client.js';
import { crearPr } from './ado/prs.js';
import { esParValido } from './repos/ramas.js';
import { medirRepos } from './repos/medir.js';
import { crearPrDePromocion } from './repos/promover.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.join(AQUI, '..');
export const WEB = path.join(RAIZ, 'web');

export const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Solo se sirve lo que esta dentro de web/. Un `..` en la URL es la forma clasica de sacarle
// el .env al servidor de al lado — y aca al lado hay un PAT y una contrasena de base. Se
// normaliza primero (un %2e%2e decodificado sigue siendo un ..) y se rechaza cualquier salto.
export function rutaSegura(url) {
  let u = String(url || '').split('?')[0].split('#')[0];
  try { u = decodeURIComponent(u); } catch { return null; }
  if (u === '/' || u === '') return 'index.html';
  const rel = u.replace(/^\/(web\/)?/, '');
  if (!rel || rel.includes('..') || rel.includes('\\') || path.isAbsolute(rel)) return null;
  const normal = path.posix.normalize(rel);
  if (normal.startsWith('..') || normal.startsWith('/')) return null;
  return normal;
}

function json(status, valor) {
  return { status, tipo: TIPOS_MIME['.json'], cuerpo: JSON.stringify(valor) };
}

// Quien esta marcando. Sale de git porque es el nombre que el equipo ya usa y nadie tiene que
// configurarlo; si no hay git, la marca queda sin autor antes que con uno inventado.
export function quienSoy(deps = {}) {
  const correr = deps.correr || ((c, a) => execFileSync(c, a, { encoding: 'utf8' }));
  try {
    return String(correr('git', ['config', 'user.name'])).trim() || null;
  } catch {
    return null;
  }
}

// Lo elegido en pantalla pisa al .env. La carpeta se distingue en tres casos: la pantalla no
// dijo nada (no viene la clave) => la del .env; eligio una => esa; eligio NINGUNA (null o
// vacia) => sin repo. Antes el tercer caso caia al .env, y un sprint de octubre se comparaba
// contra la carpeta de septiembre: todo salia D5/D6 mientras la pantalla decia "sin repo".
export function opcionesPedidas(opciones, eleccion = {}) {
  const pedidas = { ...opciones };
  if (eleccion.iteracion) pedidas.iteracion = eleccion.iteracion;
  if (Object.prototype.hasOwnProperty.call(eleccion, 'sprint')) pedidas.sprint = eleccion.sprint || null;
  if (typeof eleccion.prUrl === 'string' && eleccion.prUrl.trim()) pedidas.prUrl = eleccion.prUrl.trim();
  return pedidas;
}

// Un decisiones.json danado no puede tapar la medicion: la pantalla la muestra sin decisiones
// y avisa. Lo que no se permite es GUARDAR encima (eso lo frena /api/decisiones con un 409).
function decisionesParaMostrar(almacen) {
  try {
    return { decisiones: almacen.leerDecisiones(), danadas: false };
  } catch (e) {
    if (!(e instanceof ArchivoDanado)) throw e;
    return { decisiones: normalizarDecisiones(null), danadas: true };
  }
}

// Todo lo que la pantalla recibe sobre una medicion pasa por aca: la vista con lo decidido ya
// aplicado, y la version contra la que tiene que guardar.
function respuestaDeVista(almacen, vista, extra = {}) {
  const { decisiones, danadas } = decisionesParaMostrar(almacen);
  const delSprint = vista ? decisiones.sprints[claveDeSprint(vista.meta)] : null;
  return {
    vista: aplicarDecisiones(vista, delSprint),
    version: danadas ? null : decisiones.version,
    decisionesDanadas: danadas,
    hayMarcasViejas: almacen.hayMarcasViejas(),
    nuncaSeMidio: vista == null,
    ...extra,
  };
}

// Lo que la pantalla NO puede decidir: el hash de una marca sale de la medicion guardada, y un
// desvio se acepta con el codigo que la medicion le dio. Si no, una pantalla vieja marcaria
// una version del script que ya no es la que se midio.
function datosDeLaMedicion(vista, { tipo, clave, poner }) {
  if (!poner) return {};
  if (tipo === 'aceptado') {
    const d = aplicarDecisiones(vista, null).desvios.find((x) => x.firma === clave);
    if (!d) throw new Error('Ese desvio no esta en la ultima medicion del sprint.');
    return { codigo: d.codigo };
  }
  const f = (vista.filas || []).find((x) => x.id === clave);
  if (!f) throw new Error('Ese script no esta en la ultima medicion del sprint.');
  if (!Object.prototype.hasOwnProperty.call(f, 'hash')) {
    const e = new Error('La medicion guardada es de una version anterior y no trae el hash de los scripts: medi de nuevo antes de marcar.');
    e.status = 409;
    throw e;
  }
  return { hash: f.hash };
}

const DESCRIPCION_DECISION = {
  marca: ['desmarco como corrido en main', 'marco como corrido en main'],
  ignorado: ['volvio a tener en cuenta', 'dejo afuera de la subida'],
  aceptado: ['reabrio el desvio', 'acepto el desvio'],
};

// Para el log de la consola: el nombre del archivo o el desvio, nunca el id o la firma, que no
// le dicen nada al que mira.
function queSeDecidio(vista, { tipo, clave, motivo }) {
  let que = clave;
  if (tipo === 'aceptado') {
    const d = aplicarDecisiones(vista, null).desvios.find((x) => x.firma === clave);
    if (d) que = `${d.codigo} ${d.titulo}`;
  } else {
    const f = (vista.filas || []).find((x) => x.id === clave);
    if (f) que = f.arch;
  }
  return motivo ? `${que} (${String(motivo).trim()})` : que;
}

export function crearManejador({
  almacen, medir, opciones, quien = null,
  listarSprints = async () => ({ iteraciones: [], carpetas: [] }),
  hoy = () => fechaLocal(),
  leerEstatico,
  actualizador = { estado: estadoDelRepo, traer: traerCambios },
  alReiniciar = () => {},
  progreso = null,
  puerto = PUERTO_POR_DEFECTO,
  repos = null,
}) {
  const estatico = leerEstatico || ((rel) => {
    const abs = path.join(WEB, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  });
  const propios = new Set([`localhost:${puerto}`, `127.0.0.1:${puerto}`]);

  return async function manejar(req) {
    const { metodo } = req;
    // Escuchar solo en 127.0.0.1 no alcanza: cualquier pagina abierta en el mismo navegador puede
    // mandarle un POST a localhost (medir, actualizar, marcar un script como corrido en main), y
    // con DNS rebinding un dominio ajeno que resuelve a 127.0.0.1 hasta puede leer las respuestas.
    // Un Host distinto al propio es el rebinding; un Origin ajeno en algo que no es GET, el POST
    // de otra pagina. Sin Origin (curl, el ping del .bat) no hay navegador de por medio.
    if (!propios.has(String(req.host || '').toLowerCase())) {
      return json(403, { error: `Este panel solo atiende en http://localhost:${puerto}.` });
    }
    if (metodo !== 'GET' && req.origen != null && !propios.has(String(req.origen).toLowerCase().replace(/^http:\/\//, ''))) {
      return json(403, { error: 'Pedido desde otra pagina: rechazado.' });
    }
    const url = new URL(req.ruta || '/', 'http://local');
    const ruta = url.pathname;

    if (ruta === '/api/ping') return json(200, { ok: true });

    if (ruta === '/api/config') {
      // Nunca se devuelve nada del entorno: el PAT y la clave de la base viven ahi al lado,
      // y una pantalla local igual se abre desde cualquier navegador de la maquina.
      return json(200, { quien, opciones, estado: almacen.rutas.dir });
    }

    if (ruta === '/api/vista' && metodo === 'GET') {
      const vista = almacen.leerVista(url.searchParams.get('sprint'), url.searchParams.get('iteracion'));
      return json(200, respuestaDeVista(almacen, vista));
    }

    if (ruta === '/api/sprints' && metodo === 'GET') {
      try {
        return json(200, await listarSprints());
      } catch (e) {
        return json(500, { error: e.message });
      }
    }

    if (ruta === '/api/medir' && metodo === 'POST') {
      // El sprint elegido viaja en el cuerpo. Sin cuerpo se usa el del .env, asi el boton de
      // medir sigue andando igual cuando nadie eligio nada todavia.
      let eleccion = {};
      if (req.cuerpo) {
        try { eleccion = JSON.parse(req.cuerpo) || {}; } catch { return json(400, { error: 'El cuerpo no es JSON valido.' }); }
      }
      try {
        const { vista, avisos } = await medir(eleccion);
        // Resueltos contra la medicion ANTERIOR de este sprint: se calcula antes de pisarla y
        // queda guardado en la nueva, asi al reabrir se sigue viendo.
        const anterior = almacen.leerVista(claveDeSprint(vista?.meta));
        const conResueltos = { ...vista, resueltos: desviosResueltos(anterior, vista) };
        // Se guarda DESPUES de que la medicion salio bien: una corrida que falla no puede
        // borrar la anterior, que es la unica foto que le queda al que esta por subir.
        almacen.guardarVista(conResueltos);
        return json(200, respuestaDeVista(almacen, conResueltos, { avisos: avisos || [] }));
      } catch (e) {
        return json(500, { error: e.message });
      }
    }

    if (ruta === '/api/decisiones' && metodo === 'POST') {
      let cambio;
      try {
        cambio = JSON.parse(req.cuerpo || '');
      } catch {
        return json(400, { error: 'El cuerpo no es JSON valido.' });
      }
      if (!Number.isInteger(cambio?.version)) {
        return json(400, { error: 'Falta la version de las decisiones que leiste: sin ella no se sabe si el cambio pisa el de otro.' });
      }
      const vista = cambio.sprint ? almacen.leerVista(cambio.sprint) : null;
      if (!vista) return json(409, { error: 'Ese sprint no tiene una medicion guardada: medilo antes de decidir sobre el.' });
      try {
        const medidos = datosDeLaMedicion(vista, cambio);
        const nuevo = aplicarCambioDecision(almacen.leerDecisiones(), {
          sprint: claveDeSprint(vista.meta), tipo: cambio.tipo, clave: cambio.clave, poner: !!cambio.poner,
          motivo: cambio.motivo, quien, fecha: hoy(), ...medidos,
        });
        almacen.guardarDecisiones(nuevo, cambio.version);
        if (progreso) progreso.ok(`${quien || 'Alguien'} ${DESCRIPCION_DECISION[cambio.tipo]?.[cambio.poner ? 1 : 0] || 'cambio una decision'}: ${queSeDecidio(vista, cambio)}`);
        return json(200, respuestaDeVista(almacen, vista));
      } catch (e) {
        if (e instanceof VersionVieja) return json(409, { error: e.message, motivo: 'version', ...respuestaDeVista(almacen, vista) });
        if (e instanceof ArchivoDanado) return json(409, { error: e.message, motivo: 'danado' });
        return json(e.status || 400, { error: e.message });
      }
    }

    if (ruta === '/api/actualizaciones' && metodo === 'GET') {
      return json(200, actualizador.estado());
    }

    if (ruta === '/api/actualizar' && metodo === 'POST') {
      const r = actualizador.traer();
      // 409 y no 500: que la actualizacion no entre porque hay trabajo local no es una falla del
      // sistema, es una situacion que decide una persona. Un 500 la manda a buscar un bug.
      if (!r.ok) {
        if (progreso) progreso.aviso(`No se pudo actualizar: ${r.mensaje}`);
        return json(409, { error: r.mensaje });
      }
      if (progreso) progreso.ok(r.reiniciar ? 'Actualizado: reiniciando con la version nueva...' : 'Ya estaba actualizado.');
      // El aviso de reinicio sale DESPUES de contestar: si el proceso se muere antes, el
      // navegador se queda esperando una respuesta que nunca llega y parece que colgo.
      if (r.reiniciar) alReiniciar();
      return json(200, r);
    }

    if (ruta === '/api/repos/medir' && metodo === 'POST') {
      let pedido;
      try { pedido = JSON.parse(req.cuerpo || '{}') || {}; } catch { return json(400, { error: 'El cuerpo no es JSON valido.' }); }
      if (!esParValido(pedido.par)) return json(400, { error: `Par desconocido: ${pedido.par}. Usá dev-stage, stage-main o stage-dev.` });
      if (!repos) return json(503, { error: 'La medicion de repos no esta configurada en este servidor.' });
      try {
        return json(200, { par: pedido.par, medido: new Date().toISOString(), repos: await repos.medir(pedido.par) });
      } catch (e) {
        return json(500, { error: e.message });
      }
    }

    if (ruta === '/api/repos/crear-pr' && metodo === 'POST') {
      let pedido;
      try { pedido = JSON.parse(req.cuerpo || '{}') || {}; } catch { return json(400, { error: 'El cuerpo no es JSON valido.' }); }
      if (typeof pedido.repo !== 'string' || !pedido.repo.trim()) return json(400, { error: 'Falta el repo.' });
      if (!esParValido(pedido.par)) return json(400, { error: `Par desconocido: ${pedido.par}. Usá dev-stage, stage-main o stage-dev.` });
      if (!repos) return json(503, { error: 'La creacion de PRs no esta configurada en este servidor.' });
      try {
        const r = await repos.crearPr({ repo: pedido.repo.trim(), par: pedido.par, quien });
        if (progreso) progreso.ok(`${quien || 'Alguien'} creó ${r.titulo} en ${pedido.repo}: ${r.link}`);
        return json(200, r);
      } catch (e) {
        return json(e.status || 500, { error: e.message, ...(e.link ? { link: e.link } : {}) });
      }
    }

    if (ruta.startsWith('/api/')) return json(404, { error: `No existe ${ruta}.` });

    if (metodo === 'GET') {
      const rel = rutaSegura(req.ruta);
      if (rel) {
        const buf = estatico(rel);
        if (buf) return { status: 200, tipo: TIPOS_MIME[path.extname(rel)] || 'application/octet-stream', cuerpo: buf };
      }
    }
    return { status: 404, tipo: TIPOS_MIME['.html'], cuerpo: 'No encontrado.' };
  };
}

async function leerCuerpo(req) {
  const trozos = [];
  for await (const t of req) trozos.push(t);
  return Buffer.concat(trozos).toString('utf8');
}

export function crearServidor({ opciones, env = process.env, raiz = RAIZ, puerto = PUERTO_POR_DEFECTO } = {}) {
  const almacen = crearAlmacen(env, raiz);
  const progreso = crearProgreso();
  const medir = async (eleccion = {}) => {
    const pedidas = opcionesPedidas(opciones, eleccion);
    return conProgreso(progreso, pedidas.sprint || pedidas.iteracion || 'el sprint', async (paso) => {
      const { reporte, avisos, opciones: usadas } = await medirTodo(pedidas, { env, paso });
      const vista = construirVista(reporte, {
        org: env.AZURE_ORG || env.AZURE_ORG_URL || null,
        proyecto: env.AZURE_PROJECT || null,
        medido: new Date().toISOString(),
        sprint: usadas.sprint || null,
        iteracion: usadas.iteracion || null,
      });
      // El resumen de la consola cuenta lo mismo que la pantalla: con lo decidido aplicado.
      const { decisiones } = decisionesParaMostrar(almacen);
      const bloqueantes = aplicarDecisiones(vista, decisiones.sprints[claveDeSprint(vista.meta)]).meta.bloqueantes;
      return { vista, avisos, bloqueantes };
    });
  };

  // Codigo 10: el .bat que levanta el sistema lo lee como "volve a arrancar", asi que el boton
  // de actualizar deja corriendo el codigo nuevo sin que nadie toque una consola.
  // El cliente se crea por pedido: un .env sin PAT no impide abrir el panel, y el error sale en
  // la pestaña Repos en vez de tumbar el arranque.
  const repos = {
    medir: (par) => medirRepos(crearClienteAdo(env), par),
    crearPr: ({ repo, par, quien: q }) => crearPrDePromocion(crearClienteAdo(env), { repo, par, quien: q }, { crearPr: (d) => crearPr(env, d) }),
  };

  const manejar = crearManejador({
    almacen, medir, opciones, quien: quienSoy(),
    listarSprints: () => sprintsDisponibles(env),
    alReiniciar: () => setTimeout(() => process.exit(10), 400),
    progreso,
    puerto,
    repos,
  });

  return http.createServer(async (req, res) => {
    try {
      const r = await manejar({
        metodo: req.method, ruta: req.url, host: req.headers.host, origen: req.headers.origin, cuerpo: await leerCuerpo(req),
      });
      res.writeHead(r.status, { 'Content-Type': r.tipo, 'Cache-Control': 'no-store' });
      res.end(r.cuerpo);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': TIPOS_MIME['.json'] });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}
