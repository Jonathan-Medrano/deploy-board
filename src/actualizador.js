import { execFileSync } from 'node:child_process';

const CORRER = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// El repo de distribucion. Una copia cuyo origin NO es este repo no es una instalacion: es
// la copia de DESARROLLO, desde donde se publica. Decirle "no tenes remoto" a quien es dueno
// del remoto se lee como un bug, y manda a buscar un problema que no existe.
export const REPO_DISTRIBUCION = 'Jonathan-Medrano/deploy-board';

function gitDe(deps) {
  const correr = deps.correr || CORRER;
  return (...args) => String(correr('git', args, deps.cwd) || '').trim();
}

// Que tan atras esta esta copia respecto del repo. Nada de esto es fatal: si no hay remoto, o
// no hay red, el sistema tiene que abrir igual — mide scripts, no depende de estar al dia.
export function estadoDelRepo(deps = {}) {
  const git = gitDe(deps);
  const marca = deps.repoDistribucion || REPO_DISTRIBUCION;
  let nota = null;

  let origen = null;
  try { origen = git('remote', 'get-url', 'origin'); } catch { /* sin remoto */ }

  if (origen && !origen.includes(marca)) {
    let commit = null;
    try { commit = git('rev-parse', '--short', 'HEAD'); } catch { /* sin repo */ }
    return {
      hayCambios: false, detras: 0, adelante: 0, commit, esDesarrollo: true,
      nota: 'Esta es la copia de desarrollo: desde aca se PUBLICA el sistema, no se actualiza.',
    };
  }

  try {
    git('fetch', '--quiet');
  } catch {
    nota = 'No pude consultar el remoto (sin red o sin acceso). Sigo con lo que hay bajado.';
  }

  let commit = null;
  try { commit = git('rev-parse', '--short', 'HEAD'); } catch { /* fuera de un repo git */ }

  if (nota) return { hayCambios: false, detras: 0, adelante: 0, commit, nota };

  try {
    const [detras, adelante] = git('rev-list', '--left-right', '--count', '@{u}...HEAD')
      .split(/\s+/).map(Number);
    return { hayCambios: detras > 0, detras, adelante, commit, nota: null };
  } catch {
    return {
      hayCambios: false, detras: 0, adelante: 0, commit,
      nota: origen
        ? 'Esta rama no tiene upstream configurado: no se contra que comparar.'
        : 'Esta copia no salio de un clone: no hay de donde traer cambios.',
    };
  }
}

// `--ff-only` a proposito: si alguien toco el codigo en su maquina, el pull FALLA en vez de
// mezclar. Un merge automatico en la maquina de otro es la clase de sorpresa que nadie puede
// depurar el dia del deploy.
export function traerCambios(deps = {}) {
  const git = gitDe(deps);
  let antes = null;
  try { antes = git('rev-parse', 'HEAD'); } catch { /* sin repo */ }

  let salida;
  try {
    salida = git('pull', '--ff-only');
  } catch (e) {
    const texto = [e.message, e.stderr, e.stdout].filter(Boolean).join(' ');
    return { ok: false, reiniciar: false, mensaje: texto.trim() };
  }

  let despues = null;
  try { despues = git('rev-parse', 'HEAD'); } catch { /* sin repo */ }

  return {
    ok: true,
    // Si el commit cambio, el codigo que esta corriendo en memoria ya no es el del disco.
    reiniciar: antes != null && despues != null && antes !== despues,
    mensaje: salida || 'Ya estaba al dia.',
    commit: despues,
  };
}
