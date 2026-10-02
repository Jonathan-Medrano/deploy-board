import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CORRER = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// El sistema se distribuye como una CARPETA dentro de FidelWorkSpace, no como un repo propio.
// Una copia cuyo origin no es ese repo es la copia de DESARROLLO, desde donde se publica: decirle
// "no tenes remoto" a quien es dueno del remoto se lee como un bug.
export const REPO_DISTRIBUCION = 'FidelWorkSpace';
export const RAMA_DISTRIBUCION = 'main';
const FUENTE = `origin/${RAMA_DISTRIBUCION}`;

// Mientras FidelWorkSpace no tenga el sistema en main, el equipo lo usa clonado del repo publico
// donde el sistema ES el repo entero. Ahi se actualiza con pull, como se hacia antes de la
// carpeta: sin este camino el codigo nuevo trataba esos clones como copia de desarrollo y el
// boton de actualizar dejaba de traer nada.
export const REPO_PROPIO = 'Jonathan-Medrano/deploy-board';

function gitDe(deps) {
  const correr = deps.correr || CORRER;
  return (...args) => String(correr('git', args, deps.cwd) || '').trim();
}

function base(extra) {
  return { hayCambios: false, detras: 0, adelante: 0, commit: null, archivos: [], nota: null, ...extra };
}

// Se compara SOLO la carpeta del sistema contra main, sin importar en que rama este esa copia de
// FidelWorkSpace: quien abre el panel puede estar trabajando en cualquier otra cosa del repo, y un
// pull del repo entero le fallaria (o le traeria lo que no pidio) y el panel abriria viejo.
// Nada de esto es fatal: sin red o sin remoto el sistema abre igual con lo que hay.
export function estadoDelRepo(deps = {}) {
  const git = gitDe(deps);
  const marca = deps.repoDistribucion || REPO_DISTRIBUCION;

  let origen = null;
  try { origen = git('remote', 'get-url', 'origin'); } catch { /* sin remoto */ }

  if (!origen) {
    return base({ nota: 'Esta copia no salio de un clone: no hay de donde traer cambios.' });
  }

  if (origen.includes(deps.repoPropio || REPO_PROPIO)) return estadoDelRepoPropio(git);

  if (!origen.includes(marca)) {
    let commit = null;
    try { commit = git('rev-parse', '--short', 'HEAD'); } catch { /* sin repo */ }
    return base({
      commit, esDesarrollo: true,
      nota: 'Esta es la copia de desarrollo: desde aca se PUBLICA el sistema, no se actualiza.',
    });
  }

  try {
    git('fetch', '--quiet', 'origin', RAMA_DISTRIBUCION);
  } catch {
    return base({ nota: 'No pude consultar el remoto (sin red o sin acceso). Sigo con lo que hay bajado.' });
  }

  const carpeta = git('rev-parse', '--show-prefix').replace(/\/$/, '');
  let commit = null;
  try { commit = git('rev-parse', '--short', FUENTE); } catch { /* sin la rama */ }

  // Sin este chequeo, restaurar desde una main que todavia no tiene la carpeta BORRARIA el sistema
  // entero de la copia de quien lo abre.
  try {
    git('rev-parse', '--verify', '--quiet', `${FUENTE}:${carpeta}`);
  } catch {
    return base({ commit, nota: `El sistema todavia no esta publicado en ${RAMA_DISTRIBUCION}: sigo con lo que hay bajado.` });
  }

  // Una rama con commits propios de la carpeta que main todavia no tiene es una version en
  // prueba: pisarla con main haria imposible probarla antes de mergear.
  let propios = '';
  try { propios = git('log', '--oneline', `${FUENTE}..HEAD`, '--', '.'); } catch { /* sin HEAD */ }
  if (propios) {
    return base({ commit, nota: 'Esta rama tiene cambios propios del sistema que main todavia no tiene: abro esa version y no actualizo.' });
  }

  const archivos = archivosDistintos(git, deps, FUENTE);
  if (archivos.length && hayTrabajoLocal(git, deps, carpeta)) {
    return base({ commit, archivos, nota: 'Hay cambios sin commitear en la carpeta del sistema: no los piso. Commitealos o descartalos y volve a abrirlo.' });
  }
  return base({ hayCambios: archivos.length > 0, detras: archivos.length, commit, archivos, arbol: arbolDe(git, carpeta) });
}

function estadoDelRepoPropio(git) {
  let commit = null;
  try { commit = git('rev-parse', '--short', 'HEAD'); } catch { /* sin repo */ }
  try {
    git('fetch', '--quiet');
  } catch {
    return base({ commit, modo: 'propio', nota: 'No pude consultar el remoto (sin red o sin acceso). Sigo con lo que hay bajado.' });
  }
  try {
    const [detras, adelante] = git('rev-list', '--left-right', '--count', '@{u}...HEAD').split(/\s+/).map(Number);
    return base({ hayCambios: detras > 0, detras, adelante, commit, modo: 'propio' });
  } catch {
    return base({ commit, modo: 'propio', nota: 'Esta rama no tiene upstream configurado: no se contra que comparar.' });
  }
}

// `--ff-only` a proposito: si alguien toco el codigo en su maquina, el pull FALLA en vez de
// mezclar. Un merge automatico en la maquina de otro es la clase de sorpresa que nadie puede
// depurar el dia del deploy.
function traerDelRepoPropio(git, estado) {
  if (estado.nota) return { ok: false, reiniciar: false, mensaje: estado.nota, commit: estado.commit };
  if (!estado.hayCambios) return { ok: true, reiniciar: false, mensaje: 'Ya estaba al dia.', commit: estado.commit };
  let antes = null;
  try { antes = git('rev-parse', 'HEAD'); } catch { /* sin repo */ }
  try {
    git('pull', '--ff-only');
  } catch (e) {
    const texto = [e.message, e.stderr, e.stdout].filter(Boolean).join(' ');
    return { ok: false, reiniciar: false, mensaje: texto.trim(), commit: estado.commit };
  }
  let despues = null;
  try { despues = git('rev-parse', 'HEAD'); } catch { /* sin repo */ }
  return {
    ok: true,
    reiniciar: antes != null && despues != null && antes !== despues,
    mensaje: `Actualizado (${estado.detras} ${estado.detras === 1 ? 'commit' : 'commits'}).`,
    commit: despues,
  };
}

// La ultima version de main que se restauro, por maquina. Sin ella, una rama atrasada queda
// "modificada" contra su HEAD despues del primer restore y se confunde con trabajo local: el
// sistema dejaria de actualizarse para siempre. Vive junto al sistema y fuera de git.
const REGISTRO = '.actualizado';

function registroDe(deps) {
  const ruta = path.join(deps.cwd || process.cwd(), REGISTRO);
  return {
    leer: deps.leerRegistro || (() => { try { return fs.readFileSync(ruta, 'utf8').trim() || null; } catch { return null; } }),
    escribir: deps.escribirRegistro || ((arbol) => { try { fs.writeFileSync(ruta, arbol); } catch { /* sin permiso: se sigue */ } }),
  };
}

function arbolDe(git, carpeta) {
  try { return git('rev-parse', `${FUENTE}:${carpeta}`); } catch { return null; }
}

// Hay trabajo local cuando la carpeta no es ni lo que la rama tiene commiteado ni lo que el
// sistema dejo la ultima vez que actualizo. Lo que queda afuera es algo que escribio una persona
// (o publicar.mjs antes del PR), y eso no se pisa.
function hayTrabajoLocal(git, deps, carpeta) {
  let enHead = true;
  try { git('rev-parse', '--verify', '--quiet', `HEAD:${carpeta}`); } catch { enHead = false; }
  const igualAHead = enHead && git('status', '--porcelain', '--', '.') === '';
  if (igualAHead) return false;

  const registrado = registroDe(deps).leer();
  if (registrado && archivosDistintos(git, deps, registrado).length === 0) return false;

  // Sin registro y sin la carpeta en la rama es la primera vez: no hay de que protegerse.
  return enHead || registrado != null;
}

// Por CONTENIDO y no con `git diff`: en una rama que todavia no commiteo la carpeta, el diff
// contra el indice da todos los archivos como distintos aunque sean identicos, y el sistema
// ofreceria una "version nueva" para siempre. hash-object aplica los mismos filtros de fin de
// linea que git, asi que un CRLF en disco contra un LF en main no cuenta como cambio.
function archivosDistintos(git, deps, referencia) {
  const existe = deps.existe || ((ruta) => fs.existsSync(path.join(deps.cwd || process.cwd(), ruta)));
  const esArbol = referencia !== FUENTE;
  const listado = esArbol
    ? git('ls-tree', '-r', '-z', '--full-tree', referencia)
    : git('ls-tree', '-r', '-z', referencia, '--', '.');
  const enMain = new Map(
    listado.split('\0').filter(Boolean).map((linea) => {
      const [meta, ruta] = linea.split('\t');
      return [ruta, meta.split(' ')[2]];
    }),
  );

  const rutas = [...enMain.keys()];
  const presentes = rutas.filter(existe);
  const hashes = presentes.length ? git('hash-object', '--', ...presentes).split(/\r?\n/) : [];

  const distintos = rutas.filter((ruta) => !existe(ruta));
  presentes.forEach((ruta, i) => { if (hashes[i] !== enMain.get(ruta)) distintos.push(ruta); });

  const borradosEnMain = git('ls-files', '-z', '--', '.').split('\0').filter((ruta) => ruta && !enMain.has(ruta) && existe(ruta));
  return [...distintos, ...borradosEnMain];
}

// Pisa la carpeta del sistema con la de main y nada mas: no toca el indice, la rama ni otra
// carpeta del repo. Los archivos que no estan en git (.env, estado/) no se tocan.
export function traerCambios(deps = {}) {
  const estado = estadoDelRepo(deps);
  if (estado.modo === 'propio') return traerDelRepoPropio(gitDe(deps), estado);
  if (estado.nota) {
    return { ok: false, reiniciar: false, esDesarrollo: Boolean(estado.esDesarrollo), mensaje: estado.nota, commit: estado.commit };
  }
  const registro = registroDe(deps);
  if (!estado.hayCambios) {
    if (estado.arbol) registro.escribir(estado.arbol);
    return { ok: true, reiniciar: false, mensaje: 'Ya estaba al dia.', commit: estado.commit };
  }

  const git = gitDe(deps);
  try {
    git('restore', `--source=${FUENTE}`, '--worktree', '--', '.');
  } catch (e) {
    const texto = [e.message, e.stderr, e.stdout].filter(Boolean).join(' ');
    return { ok: false, reiniciar: false, mensaje: texto.trim(), commit: estado.commit };
  }
  if (estado.arbol) registro.escribir(estado.arbol);

  return {
    ok: true,
    // El codigo que esta corriendo en memoria ya no es el del disco.
    reiniciar: true,
    mensaje: `Actualizado a ${estado.commit || RAMA_DISTRIBUCION} (${estado.detras} ${estado.detras === 1 ? 'archivo' : 'archivos'}).`,
    commit: estado.commit,
  };
}
