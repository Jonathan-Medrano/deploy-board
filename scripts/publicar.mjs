import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// El sistema se distribuye por DOS canales y los dos se mantienen al dia con la misma copia:
//  - la carpeta Tools/Paneles/deploy-board de FidelWorkSpace (se actualiza desde main), y
//  - el repo publico Jonathan-Medrano/deploy-board, donde el sistema ES el repo entero (se
//    actualiza con pull). Cada dev usa el que tiene clonado.
// El desarrollo vive en el workspace privado, donde la historia menciona sprints, work items y
// companeros por nombre: por eso se publica una COPIA de los archivos, nunca la historia.
//
// Este script solo deja los dos clones locales al dia. El commit y el push (y en FidelWorkSpace,
// el PR a main) los hace una persona. Medido el 2026-10-13: cuando solo se publicaba en
// FidelWorkSpace, el espejo quedo congelado 11 dias y nadie que lo usaba recibio nada.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORIGEN = path.join(AQUI, '..');

const DESTINOS = [
  {
    nombre: 'FidelWorkSpace',
    marca: 'FidelWorkSpace',
    carpeta: process.env.DEPLOY_BOARD_PUBLICAR_EN
      || path.join(os.homedir(), 'Desktop', 'FidelWorkSpace', 'Tools', 'Paneles', 'deploy-board'),
    falta: 'commit en una rama de FidelWorkSpace y PR a main.',
  },
  {
    nombre: 'espejo de GitHub',
    marca: 'Jonathan-Medrano/deploy-board',
    url: 'https://github.com/Jonathan-Medrano/deploy-board.git',
    carpeta: process.env.DEPLOY_BOARD_ESPEJO_EN
      || path.join(os.homedir(), 'Desktop', 'deploy-board-espejo'),
    falta: 'commit en main y push SIN force (los clones del equipo actualizan con pull --ff-only).',
  },
];

// Lo que no es codigo y vive solo en cada maquina: ni se copia ni se borra del destino.
const EXCLUIDOS = new Set(['.git', 'node_modules', 'estado', '.env', '.actualizado']);
const excluido = (nombre) => EXCLUIDOS.has(nombre) || nombre.endsWith('.log');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function origenDe(carpeta) {
  try { return git(['remote', 'get-url', 'origin'], carpeta).trim(); } catch { return ''; }
}

// Solo lo trackeado: lo que la copia de desarrollo tiene suelto (registros, pruebas a mano) no
// es parte del sistema.
function archivosDelSistema() {
  return git(['ls-files', '-z', '--', '.'], ORIGEN).split('\0').filter(Boolean);
}

function vaciar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluido(e.name)) continue;
    fs.rmSync(path.join(dir, e.name), { recursive: true, force: true });
  }
}

function copiar(archivos, hasta) {
  for (const relativo of archivos) {
    const b = path.join(hasta, relativo);
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.copyFileSync(path.join(ORIGEN, relativo), b);
  }
}

// Corrido desde una copia distribuida, ORIGEN y el destino son la misma carpeta: vaciar el
// destino borraria el sistema entero antes de copiar nada. Se publica solo desde la de desarrollo.
const origenDeLaCopia = origenDe(ORIGEN);
if (DESTINOS.some((d) => path.resolve(ORIGEN) === path.resolve(d.carpeta) || origenDeLaCopia.includes(d.marca))) {
  salir('Esta es una copia distribuida: se publica desde la copia de desarrollo, no desde aca.');
}

// Sin esto, lo que se publica no es ningun commit: los dos canales quedarian con una version que
// no se puede rastrear ni volver a publicar igual.
if (git(['status', '--porcelain', '--', '.'], ORIGEN).trim()) {
  salir('Hay cambios sin commitear en el sistema: commitealos antes de publicar.');
}
const commit = git(['rev-parse', '--short', 'HEAD'], ORIGEN).trim();

function prepararFidelWorkSpace(d) {
  const padre = path.dirname(d.carpeta);
  if (!fs.existsSync(padre)) return `No existe ${padre}. Clona FidelWorkSpace o indica la carpeta con DEPLOY_BOARD_PUBLICAR_EN.`;
  const origen = origenDe(padre);
  if (!origen.includes(d.marca)) return `${padre} no es un clon de FidelWorkSpace (origin: ${origen || 'ninguno'}).`;
  fs.mkdirSync(d.carpeta, { recursive: true });
  return null;
}

// El espejo se trae al dia ANTES de copiar: un commit encima de un clon viejo no se puede pushear
// sin force, y un force rompe el pull --ff-only de cada clon del equipo.
function prepararEspejo(d) {
  if (!fs.existsSync(d.carpeta)) {
    try { git(['clone', '--quiet', d.url, d.carpeta], os.homedir()); } catch { return `No pude clonar ${d.url} en ${d.carpeta}.`; }
    return null;
  }
  const origen = origenDe(d.carpeta);
  if (!origen.includes(d.marca)) return `${d.carpeta} no es un clon del espejo (origin: ${origen || 'ninguno'}). Indica otra carpeta con DEPLOY_BOARD_ESPEJO_EN.`;
  if (git(['status', '--porcelain'], d.carpeta).trim()) return `El clon del espejo en ${d.carpeta} tiene cambios sin commitear: commitealos o descartalos primero.`;
  try { git(['pull', '--quiet', '--ff-only'], d.carpeta); } catch { return `No pude traer al dia el clon del espejo en ${d.carpeta} (pull --ff-only).`; }
  return null;
}

const archivos = archivosDelSistema();
let fallas = 0;

for (const d of DESTINOS) {
  const problema = d.url ? prepararEspejo(d) : prepararFidelWorkSpace(d);
  if (problema) {
    console.error(`[${d.nombre}] ${problema}\n`);
    fallas++;
    continue;
  }
  vaciar(d.carpeta);
  copiar(archivos, d.carpeta);

  const cambios = git(['status', '--porcelain', '--', '.'], d.carpeta).trim();
  if (!cambios) console.log(`[${d.nombre}] No hay nada nuevo para publicar en ${d.carpeta}.\n`);
  else console.log(`[${d.nombre}] Copiado ${commit} a ${d.carpeta}:\n${cambios}\nFalta: ${d.falta}\n`);
}

if (fallas) process.exit(1);
