import fs from 'node:fs';
import path from 'node:path';
import { normalizar } from './marcas.js';

// Donde viven las marcas y la ultima medicion. Es una CARPETA configurable a proposito: el
// sistema corre en la maquina de cada uno, pero las marcas de main no son personales — que
// Ana marque y vos lo veas es todo el punto. Apuntando DEPLOY_BOARD_ESTADO a una carpeta
// compartida, el equipo comparte marcas sin montar un servidor.
export function rutasDeEstado(env = process.env, raiz = process.cwd()) {
  const dir = env.DEPLOY_BOARD_ESTADO || path.join(raiz, 'estado');
  return { dir, marcas: path.join(dir, 'marcas.json'), vista: path.join(dir, 'vista.json') };
}

function leerJson(ruta, deps) {
  const existe = deps.existe || fs.existsSync;
  const leer = deps.leer || ((r) => fs.readFileSync(r, 'utf8'));
  if (!existe(ruta)) return null;
  try {
    return JSON.parse(leer(ruta));
  } catch {
    // Un archivo ilegible NO se pisa en silencio: se avisa y se sigue con lo que hay. Borrar
    // las marcas de todo el equipo porque un JSON quedo a medio escribir es peor que no leerlas.
    return null;
  }
}

function escribirJson(ruta, valor, deps) {
  const mkdir = deps.mkdir || ((d) => fs.mkdirSync(d, { recursive: true }));
  const escribir = deps.escribir || ((r, t) => fs.writeFileSync(r, t));
  mkdir(path.dirname(ruta));
  escribir(ruta, JSON.stringify(valor, null, 2));
}

export function crearAlmacen(env = process.env, raiz = process.cwd(), deps = {}) {
  const r = rutasDeEstado(env, raiz);
  return {
    rutas: r,
    leerMarcas: () => normalizar(leerJson(r.marcas, deps)),
    guardarMarcas: (v) => escribirJson(r.marcas, v, deps),
    leerVista: () => leerJson(r.vista, deps),
    guardarVista: (v) => escribirJson(r.vista, v, deps),
  };
}
