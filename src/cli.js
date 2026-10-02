import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivosEnv, cargarEnv } from './entorno.js';
import { medirTodo } from './medir.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
cargarEnv(archivosEnv(RAIZ));
import { formatearReporte } from './reporte.js';
import { crearAlmacen, ArchivoDanado } from './almacen.js';
import { claveDeSprint } from './decisiones.js';
import { reporteConDecisiones } from './consola.js';
import { crearProgreso, conProgreso } from './progreso.js';

// Los flags pisan al .env, no al reves: asi se mide otro sprint sin editar el archivo, que
// es como se termina dejando una configuracion de prueba puesta sin darse cuenta.
export function opcionesPorDefecto(env = process.env) {
  return {
    iteracion: env.DEPLOY_BOARD_ITERACION || undefined,
    sprint: env.DEPLOY_BOARD_SPRINT || undefined,
    ambientes: (env.DEPLOY_BOARD_AMBIENTES || 'dev,stage').split(',').map((x) => x.trim()).filter(Boolean),
    destino: env.DEPLOY_BOARD_DESTINO || 'stage',
    json: false,
  };
}

export function args(argv, env = process.env) {
  const o = opcionesPorDefecto(env);
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

// Lo decidido en el tablero (aceptados, ignorados, marcas de main) se aplica tambien aca: si
// no, la consola y la pantalla dan veredictos distintos sobre la misma medicion.
function conDecisiones(reporte, usadas) {
  const sprint = claveDeSprint(usadas);
  try {
    const dec = crearAlmacen(process.env, RAIZ).leerDecisiones();
    return reporteConDecisiones(reporte, dec.sprints[sprint], sprint);
  } catch (e) {
    if (!(e instanceof ArchivoDanado)) throw e;
    return reporteConDecisiones(reporte, null, sprint, { danadas: true });
  }
}

async function main() {
  const o = args(process.argv.slice(3));
  const r = await conProgreso(crearProgreso(), o.sprint || o.iteracion || 'el sprint', async (paso) => {
    const { reporte, avisos, opciones: usadas } = await medirTodo(o, { paso });
    const final = conDecisiones(reporte, usadas);
    return { final, avisos, bloqueantes: final.bloqueantes };
  });

  console.log(o.json ? JSON.stringify(r.final, null, 2) : formatearReporte(r.final));
  process.exitCode = r.final.listoParaSubir ? 0 : 1;
}

if (process.argv[2] === 'report') {
  main().catch((e) => { console.error(e.message); process.exitCode = 2; });
} else {
  console.log('Uso: node src/cli.js report [--iteracion "Fidel\\2026\\2026 Septiembre 2"] [--sprint Sprint_2026_09_01] [--ambientes dev,stage] [--destino stage] [--json]');
}
