import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// El repo publico es un ESPEJO de distribucion, no el repo de desarrollo. El desarrollo vive
// en el workspace privado, donde la historia menciona sprints, work items y companeros por
// nombre. Publicar con `git subtree push` arrastraria toda esa historia, y una vez publica no
// se saca mas. Por eso el espejo tiene su propia historia, lineal, hecha de snapshots.
//
// Lineal y no force-push a proposito: los devs actualizan con `git pull --ff-only`, y un
// force-push les rompe el pull a todos a la vez.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORIGEN = path.join(AQUI, '..');
const REMOTO = process.env.DEPLOY_BOARD_REMOTO || 'https://github.com/Jonathan-Medrano/deploy-board.git';

const EXCLUIDOS = new Set(['.git', 'node_modules', 'estado', '.env']);
const inicial = process.argv.includes('--inicial');
const mensaje = (() => {
  const i = process.argv.indexOf('--mensaje');
  return i >= 0 ? process.argv[i + 1] : 'chore: version nueva';
})();

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function copiar(desde, hasta) {
  fs.mkdirSync(hasta, { recursive: true });
  for (const e of fs.readdirSync(desde, { withFileTypes: true })) {
    if (EXCLUIDOS.has(e.name) || e.name.endsWith('.log')) continue;
    const a = path.join(desde, e.name), b = path.join(hasta, e.name);
    if (e.isDirectory()) copiar(a, b);
    else fs.copyFileSync(a, b);
  }
}

function vaciar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    fs.rmSync(path.join(dir, e.name), { recursive: true, force: true });
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publicar-'));
try {
  if (inicial) {
    // Historia nueva desde cero. Se hace UNA sola vez, antes de que alguien clone: despues,
    // un force-push le rompe el `pull --ff-only` a todo el equipo al mismo tiempo.
    fs.mkdirSync(path.join(tmp, 'repo'));
    const repo = path.join(tmp, 'repo');
    git(['init', '-q', '-b', 'main'], repo);
    copiar(ORIGEN, repo);
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', mensaje], repo);
    git(['push', '--force', REMOTO, 'main'], repo);
    console.log('Publicado con historia nueva.');
  } else {
    const repo = path.join(tmp, 'repo');
    git(['clone', '-q', REMOTO, repo], tmp);
    vaciar(repo);
    copiar(ORIGEN, repo);
    git(['add', '-A'], repo);
    const cambios = git(['status', '--porcelain'], repo).trim();
    if (!cambios) { console.log('No hay nada nuevo para publicar.'); process.exit(0); }
    git(['commit', '-q', '-m', mensaje], repo);
    git(['push', REMOTO, 'main'], repo);
    console.log('Publicado:\n' + cambios);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
