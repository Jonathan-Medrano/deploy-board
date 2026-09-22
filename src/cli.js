import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarEnv } from './entorno.js';
import { medirTodo } from './medir.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
cargarEnv([path.join(RAIZ, '.env'), path.join(RAIZ, '..', 'taskrunner', '.env')]);
import { formatearReporte } from './reporte.js';

function args(argv) {
  const o = { ambientes: ['dev', 'stage'], destino: 'stage', json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--iteracion') o.iteracion = argv[++i];
    else if (a === '--sprint') o.sprint = argv[++i];
    else if (a === '--ambientes') o.ambientes = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--destino') o.destino = argv[++i];
    else if (a === '--json') o.json = true;
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(3));
  const { reporte, avisos } = await medirTodo(o);

  for (const a of avisos) console.error(`AVISO: ${a}`);
  console.log(o.json ? JSON.stringify(reporte, null, 2) : formatearReporte(reporte));
  process.exitCode = reporte.listoParaSubir ? 0 : 1;
}

if (process.argv[2] === 'report') {
  main().catch((e) => { console.error(e.message); process.exitCode = 2; });
} else {
  console.log('Uso: node src/cli.js report [--iteracion "Fidel\\2026\\2026 Septiembre 2"] [--sprint Sprint_2026_09_01] [--ambientes dev,stage] [--destino stage] [--json]');
}
