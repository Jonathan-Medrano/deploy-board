import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// El sistema se distribuye como la carpeta Tools/Paneles/deploy-board de FidelWorkSpace. El
// desarrollo vive en el workspace privado, donde la historia menciona sprints, work items y
// companeros por nombre: por eso se publica una COPIA de los archivos, nunca la historia.
//
// Este script solo deja la carpeta al dia en el clon local de FidelWorkSpace. El commit y el PR
// a main los hace una persona: cuando se mergea, cada uno lo recibe al abrir el panel.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORIGEN = path.join(AQUI, '..');
const DESTINO = process.env.DEPLOY_BOARD_PUBLICAR_EN
  || path.join(os.homedir(), 'Desktop', 'FidelWorkSpace', 'Tools', 'Paneles', 'deploy-board');

// Lo que no es codigo y vive solo en cada maquina: ni se copia ni se borra del destino.
const EXCLUIDOS = new Set(['.git', 'node_modules', 'estado', '.env']);
const excluido = (nombre) => EXCLUIDOS.has(nombre) || nombre.endsWith('.log');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function copiar(desde, hasta) {
  fs.mkdirSync(hasta, { recursive: true });
  for (const e of fs.readdirSync(desde, { withFileTypes: true })) {
    if (excluido(e.name)) continue;
    const a = path.join(desde, e.name), b = path.join(hasta, e.name);
    if (e.isDirectory()) copiar(a, b);
    else fs.copyFileSync(a, b);
  }
}

function vaciar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluido(e.name)) continue;
    fs.rmSync(path.join(dir, e.name), { recursive: true, force: true });
  }
}

// Corrido desde la copia distribuida, ORIGEN y DESTINO son la misma carpeta: vaciar el destino
// borraria el sistema entero antes de copiar nada. Se publica solo desde la copia de desarrollo.
let origenDeLaCopia = '';
try { origenDeLaCopia = git(['remote', 'get-url', 'origin'], ORIGEN).trim(); } catch { /* sin repo */ }
if (path.resolve(ORIGEN) === path.resolve(DESTINO) || origenDeLaCopia.includes('FidelWorkSpace')) {
  console.error('Esta es la copia distribuida en FidelWorkSpace: se publica desde la copia de desarrollo, no desde aca.');
  process.exit(1);
}

const padre = path.dirname(DESTINO);
if (!fs.existsSync(padre)) {
  console.error(`No existe ${padre}. Cloná FidelWorkSpace o indicá la carpeta con DEPLOY_BOARD_PUBLICAR_EN.`);
  process.exit(1);
}
const origen = git(['remote', 'get-url', 'origin'], padre).trim();
if (!origen.includes('FidelWorkSpace')) {
  console.error(`${padre} no es un clon de FidelWorkSpace (origin: ${origen}).`);
  process.exit(1);
}

fs.mkdirSync(DESTINO, { recursive: true });
vaciar(DESTINO);
copiar(ORIGEN, DESTINO);

const cambios = git(['status', '--porcelain', '--', '.'], DESTINO).trim();
if (!cambios) {
  console.log('No hay nada nuevo para publicar.');
} else {
  console.log(`Copiado a ${DESTINO}:\n${cambios}\n`);
  console.log('Falta: commit en una rama de FidelWorkSpace y PR a main.');
}
