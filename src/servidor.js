import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { medirTodo } from './medir.js';
import { construirVista } from './vista.js';
import { crearAlmacen } from './almacen.js';
import { aplicarCambio } from './marcas.js';
import { estadoDelRepo, traerCambios } from './actualizador.js';
import { sprintsDisponibles } from './sprints-ado.js';

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

export function crearManejador({
  almacen, medir, opciones, quien = null,
  listarSprints = async () => ({ iteraciones: [], carpetas: [] }),
  hoy = () => new Date().toISOString().slice(0, 10),
  leerEstatico,
  actualizador = { estado: estadoDelRepo, traer: traerCambios },
  alReiniciar = () => {},
}) {
  const estatico = leerEstatico || ((rel) => {
    const abs = path.join(WEB, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  });

  return async function manejar(req) {
    const { metodo, ruta } = req;

    if (ruta === '/api/ping') return json(200, { ok: true });

    if (ruta === '/api/config') {
      // Nunca se devuelve nada del entorno: el PAT y la clave de la base viven ahi al lado,
      // y una pantalla local igual se abre desde cualquier navegador de la maquina.
      return json(200, { quien, opciones, estado: almacen.rutas.dir });
    }

    if (ruta === '/api/vista' && metodo === 'GET') {
      const vista = almacen.leerVista();
      return json(200, { vista, marcas: almacen.leerMarcas(), nuncaSeMidio: vista == null });
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
        // Se guarda DESPUES de que la medicion salio bien: una corrida que falla no puede
        // borrar la anterior, que es la unica foto que le queda al que esta por subir.
        almacen.guardarVista(vista);
        return json(200, { vista, avisos: avisos || [], marcas: almacen.leerMarcas() });
      } catch (e) {
        return json(500, { error: e.message });
      }
    }

    if (ruta === '/api/marcas' && metodo === 'POST') {
      let cambio;
      try {
        cambio = JSON.parse(req.cuerpo || '');
      } catch {
        return json(400, { error: 'El cuerpo no es JSON valido.' });
      }
      try {
        const nuevo = aplicarCambio(almacen.leerMarcas(), { ...cambio, quien, fecha: hoy() });
        almacen.guardarMarcas(nuevo);
        return json(200, nuevo);
      } catch (e) {
        return json(400, { error: e.message });
      }
    }

    if (ruta === '/api/actualizaciones' && metodo === 'GET') {
      return json(200, actualizador.estado());
    }

    if (ruta === '/api/actualizar' && metodo === 'POST') {
      const r = actualizador.traer();
      // 409 y no 500: que el pull no entre porque hay trabajo local no es una falla del
      // sistema, es una situacion que decide una persona. Un 500 la manda a buscar un bug.
      if (!r.ok) return json(409, { error: r.mensaje });
      // El aviso de reinicio sale DESPUES de contestar: si el proceso se muere antes, el
      // navegador se queda esperando una respuesta que nunca llega y parece que colgo.
      if (r.reiniciar) alReiniciar();
      return json(200, r);
    }

    if (ruta.startsWith('/api/')) return json(404, { error: `No existe ${ruta}.` });

    if (metodo === 'GET') {
      const rel = rutaSegura(ruta);
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

export function crearServidor({ opciones, env = process.env, raiz = RAIZ } = {}) {
  const almacen = crearAlmacen(env, raiz);
  const medir = async (eleccion = {}) => {
    // Lo elegido en pantalla pisa al .env, pero solo lo que vino: un select vacio no puede
    // borrar la configuracion de base.
    const pedidas = { ...opciones };
    if (eleccion.iteracion) pedidas.iteracion = eleccion.iteracion;
    if (eleccion.sprint) pedidas.sprint = eleccion.sprint;
    const { reporte, avisos, opciones: usadas } = await medirTodo(pedidas, { env });
    const vista = construirVista(reporte, {
      org: env.AZURE_ORG || env.AZURE_ORG_URL || null,
      proyecto: env.AZURE_PROJECT || null,
      medido: new Date().toISOString(),
      sprint: usadas.sprint || null,
      iteracion: usadas.iteracion || null,
    });
    return { vista, avisos };
  };

  // Codigo 10: el .bat que levanta el sistema lo lee como "volve a arrancar", asi que el boton
  // de actualizar deja corriendo el codigo nuevo sin que nadie toque una consola.
  const manejar = crearManejador({
    almacen, medir, opciones, quien: quienSoy(),
    listarSprints: () => sprintsDisponibles(env),
    alReiniciar: () => setTimeout(() => process.exit(10), 400),
  });

  return http.createServer(async (req, res) => {
    try {
      const r = await manejar({ metodo: req.method, ruta: req.url, cuerpo: await leerCuerpo(req) });
      res.writeHead(r.status, { 'Content-Type': r.tipo, 'Cache-Control': 'no-store' });
      res.end(r.cuerpo);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': TIPOS_MIME['.json'] });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}
