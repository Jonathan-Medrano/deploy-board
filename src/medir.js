import path from 'node:path';
import { crearClienteAdo } from './ado/client.js';
import { descubrirAdjuntos } from './fuentes/adjuntos.js';
import { descubrirRepo } from './fuentes/repo.js';
import { reconciliar } from './reconciliador/index.js';
import { medirAmbiente } from './db/ejecutar.js';
import { validarEscalera } from './desvios/escalera.js';
import { construirReporte } from './reporte.js';
import { rolesDesde } from './roles.js';

export const OPCIONES_POR_DEFECTO = { ambientes: ['dev', 'stage'], destino: 'stage' };

// Una sola barrida, dos consumidores: la consola y el servidor local. Antes esto vivia dentro
// de main() en cli.js, y un servidor que quisiera re-medir tenia que volver a escribirla —
// dos copias de la misma secuencia se desincronizan en el primer cambio.
//
// Los avisos se DEVUELVEN en vez de imprimirse: un aviso que solo existe como console.error
// no puede llegar a una pantalla. Quien llama decide si van a stderr o a la UI.
export async function medirTodo(opciones = {}, deps = {}) {
  const o = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const env = deps.env || process.env;
  const ado = deps.ado || crearClienteAdo(env);
  const avisos = [];

  const { scripts: adjuntos, wis, tasks } = await descubrirAdjuntos(ado, o.iteracion);

  const dirMig = path.join(env.API_NET_DIR || '../Api.Net', 'Api', 'DB_Migrations');
  const repo = o.sprint ? descubrirRepo(dirMig, o.sprint) : [];

  const scripts = reconciliar({ adjuntos, repo });

  const medir = deps.medirAmbiente || medirAmbiente;
  const estados = {};
  for (const amb of o.ambientes) {
    const medido = await medir(scripts, amb, { env });
    for (const [id, v] of Object.entries(medido)) (estados[id] ||= {})[amb] = v;
  }

  const reporte = construirReporte({
    scripts, wis, tasks, estados,
    destino: o.destino, ambientes: o.ambientes,
    roles: rolesDesde(env),
  });

  // La escalera se valida contra la lista REAL de estados de ADO, no solo contra los que
  // aparecieron en este sprint: asi un estado nuevo del proceso se avisa ANTES de que llegue
  // a una tarjeta, no despues. Si ADO no contesta, se cae a los observados — un aviso menos
  // completo es preferible a que el reporte entero falle por un chequeo accesorio.
  const tipos = [...new Set(wis.map((w) => w.tipo).filter(Boolean))];
  let estadosDelProceso = [...new Set([...wis, ...tasks].map((x) => x.estado).filter(Boolean))];
  // Por tipo y no con Promise.all: las llamadas son independientes, y con Promise.all un solo
  // tipo que falle descarta TAMBIEN las listas que si volvieron. Una respuesta parcial es
  // estrictamente mejor que ninguna, y el tipo que fallo se nombra en vez de desaparecer.
  const tiposSinLista = [];
  for (const t of tipos) {
    try {
      estadosDelProceso = [...new Set([...estadosDelProceso, ...(await ado.listarEstados(t))])];
    } catch {
      tiposSinLista.push(t);
    }
  }
  if (tiposSinLista.length) {
    avisos.push(`No pude leer la lista de estados de ADO para: ${tiposSinLista.join(', ')}. Para esos tipos valido solo los observados en este sprint.`);
  }
  const desconocidos = validarEscalera(estadosDelProceso);
  if (desconocidos.length) {
    avisos.push(`Estados que la escalera no conoce (no disparan D1 ni D4): ${desconocidos.join(', ')}`);
  }

  return { reporte, avisos, opciones: o };
}
