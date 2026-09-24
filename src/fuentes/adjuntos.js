import { decodificarSql } from '../parser/leerSql.js';
import { armarScriptParcial, esRespaldo } from './comun.js';
import { parsearNombre } from '../parser/nombre.js';

// SIN filtro de asignado: la tarjeta de scripts no esta asignada a nadie, asi que cualquier
// consulta que filtre por @Me no la ve. Y va por TODOS los work items de la iteracion, no
// por los hijos de la tarjeta "Scripts": el dia que el equipo deje de usar esa tarjeta y
// adjunte los .sql a su propia User Story, esto sigue funcionando sin cambios.
function consultaIteracion(iteracion) {
  const iter = iteracion ? `'${String(iteracion).replace(/'/g, "''")}'` : '@CurrentIteration';
  return 'SELECT [System.Id] FROM WorkItems ' +
    `WHERE [System.IterationPath] UNDER ${iter} ` +
    "AND [System.State] <> 'Removed' " +
    'ORDER BY [System.Id]';
}

// Un item de ADO a lo que el resto del sistema llama work item. Se exporta porque medir.js trae
// aparte los work items que un script nombra y que no estan en el sprint: dos mapeos del mismo
// item divergen en el primer campo nuevo.
export function aWorkItem(w) {
  const f = w.fields || {};
  return {
    id: w.id,
    tipo: f['System.WorkItemType'] || '',
    titulo: f['System.Title'] || '',
    estado: f['System.State'] || '',
    cantidadScripts: f['Custom.CantidadScripts'] ?? null,
    tieneSP: f['Custom.TieneSP'] ?? null,
    tieneReporte: f['Custom.TieneReporte'] ?? null,
    asignadoA: (f['System.AssignedTo'] || {}).displayName || null,
    asignadoAEmail: (f['System.AssignedTo'] || {}).uniqueName || null,
  };
}

export async function descubrirAdjuntos(ado, iteracion) {
  const ids = await ado.wiql(consultaIteracion(iteracion));
  if (!ids.length) return { scripts: [], wis: [], tasks: [], respaldos: [] };

  const items = await ado.getWorkItems(ids);
  const scripts = [];
  const tasks = [];
  const respaldos = [];
  const wis = items.map(aWorkItem);

  for (const w of items) {
    const adjuntosSql = (w.relations || [])
      .filter((r) => r.rel === 'AttachedFile' && /\.sql$/i.test((r.attributes || {}).name || ''))
      .map((r) => ({ url: r.url, nombre: r.attributes.name, creado: r.attributes.resourceCreatedDate || '' }));

    // Los respaldos se descartan ANTES de bajar el archivo: no son scripts del sprint, asi que
    // ni entran a `scripts` ni cuentan como descarga.
    const sqls = adjuntosSql.filter((a) => !esRespaldo(a.nombre));
    for (const a of adjuntosSql.filter((a) => esRespaldo(a.nombre))) {
      respaldos.push({ wiId: w.id, archivo: a.nombre });
    }
    if (!sqls.length) continue;

    // Una sola llamada al historial por work item, no una por adjunto.
    const subioCada = await ado.quienSubioCadaAdjunto(w.id);

    const padre = (w.relations || [])
      .filter((r) => r.attributes && r.attributes.name === 'Parent')
      .map((r) => Number(r.url.split('/').pop()))[0] ?? null;

    // El tipo del contenedor lo usa el reconciliador: el mismo archivo sin id adjunto a la US
    // y a su task de scripts se une en la fila de la US, que es el work item real.
    const tipoContenedor = (w.fields || {})['System.WorkItemType'] || '';
    const tituloContenedor = (w.fields || {})['System.Title'] || '';
    const llevados = [];
    for (const a of sqls) {
      let s;
      try {
        const sql = decodificarSql(await ado.descargarAdjunto(a.url));
        s = armarScriptParcial(a.nombre, sql, 'adjunto', {
          contenedorId: w.id,
          contenedorTipo: tipoContenedor,
          contenedorTitulo: tituloContenedor,
          wiIdFallback: w.id,
          contenedorPadre: padre,
          creado: a.creado || null,
          // La fecha sale del adjunto, NO de la revision: revisedDate vale 9999-01-01 en la
          // revision vigente, que es el centinela de "todavia abierta".
          responsables: {
            subioElAdjunto: subioCada[a.nombre]
              ? { ...subioCada[a.nombre], fecha: (a.creado || '').slice(0, 10) || null }
              : null,
          },
        });
      } catch (e) {
        // Un adjunto ilegible es UN script sin veredicto, no un barrido caido. Y el NOMBRE
        // sigue siendo legible: parsearNombre es puro y no depende del contenido, asi que
        // nulear wiId/esPre/accion aca fabricaba un D7 y un D11 falsos sobre un adjunto bien
        // nombrado, y ademas apagaba el D3 de un PRE que si falta. Solo se pierde lo que el
        // contenido ilegible realmente niega: los objetos y el SQL.
        const datos = parsearNombre(a.nombre);
        s = {
          ...datos,
          id: `ilegible/${w.id}/${a.nombre}`,
          objetos: [], sql: '', fuente: 'adjunto', contenedorId: w.id, contenedorTipo: tipoContenedor, contenedorTitulo: tituloContenedor, responsables: {},
          hash: null, creado: a.creado || null,
          sondas: [{ id: 's0', tipo: 'sin_sonda', detalle: `no pude leer ${a.nombre}: ${e.message}` }],
        };
      }
      scripts.push(s);
      llevados.push(s.id);
    }
    // Solo una TASK es "la task de SCRIPTS". Un bug adjuntado a su User Story no convierte a
    // la US en contenedora: D1 le pedia mover la US al estado del bug, con setEstado sobre la US.
    const f = w.fields || {};
    if (f['System.WorkItemType'] === 'Task') {
      tasks.push({ id: w.id, titulo: f['System.Title'] || '', estado: f['System.State'] || '', adjuntos: llevados });
    }
  }

  return { scripts, wis, tasks, respaldos };
}
