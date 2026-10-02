import fs from 'node:fs';
import path from 'node:path';

export const PUERTO_POR_DEFECTO = 4700;

// Puerto propio: el task runner esta en 4600 y los dev servers por worktree en los 3000/4300.
// Una sola funcion para el servidor, la guarda de Host y el .bat que abre el navegador: si cada
// uno lo leyera por su lado, cambiar DEPLOY_BOARD_PORT abriria la pantalla en el puerto viejo.
export function puertoDelEntorno(env = process.env) {
  const n = Number(env.DEPLOY_BOARD_PORT);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : PUERTO_POR_DEFECTO;
}

// El .env de al lado y, en la maquina de desarrollo, el del task runner, para no copiar el PAT
// dos veces. Solo si la carpeta hermana ES el task runner: en FidelWorkSpace, Tools/Paneles/
// taskrunner seria otro panel, y su .env se cargaria en silencio.
export function archivosEnv(raiz, deps = {}) {
  const leer = deps.leer || ((r) => fs.readFileSync(r, 'utf8'));
  const rutas = [path.join(raiz, '.env')];
  const hermano = path.join(raiz, '..', 'taskrunner');
  try {
    if (JSON.parse(leer(path.join(hermano, 'package.json'))).name === 'fidel-taskrunner') rutas.push(path.join(hermano, '.env'));
  } catch {
    // Sin package.json legible no hay task runner al lado.
  }
  return rutas;
}

// Un .env propio en vez de `node --env-file`: esa bandera pide Node 20.6 o mas, y el sistema
// se instala en la maquina de cada uno. Fallar al arrancar por la version de Node, con un
// mensaje del runtime que no dice nada del problema, es la peor primera impresion posible.
export function parsearEnv(texto) {
  const out = {};
  for (const linea of String(texto).split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i <= 0) continue;
    const clave = l.slice(0, i).trim();
    let valor = l.slice(i + 1).trim();
    const c = valor[0];
    if ((c === '"' || c === "'") && valor.endsWith(c) && valor.length > 1) valor = valor.slice(1, -1);
    out[clave] = valor;
  }
  return out;
}

// El entorno real GANA. Asi se puede probar contra otro sprint con una variable en la terminal
// sin editar el archivo, que es como se termina commiteando una credencial de otro ambiente.
export function aplicarEnv(env, valores) {
  for (const [k, v] of Object.entries(valores)) {
    if (env[k] == null || env[k] === '') env[k] = v;
  }
  return env;
}

export function cargarEnv(rutas, env = process.env, deps = {}) {
  const existe = deps.existe || fs.existsSync;
  const leer = deps.leer || ((r) => fs.readFileSync(r, 'utf8'));
  for (const r of rutas) {
    if (!existe(r)) continue;
    try {
      aplicarEnv(env, parsearEnv(leer(r)));
    } catch {
      // Un .env ilegible no puede tumbar el arranque: el tablero abre igual y el primer
      // pedido que necesite una credencial va a decir exactamente cual falta.
    }
  }
  return env;
}
