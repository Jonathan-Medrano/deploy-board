import { responsableDe } from './reporte.js';

// Que DEFINE un script decide como se lee y en que orden se mira. Un SP se reemplaza entero y
// es barato de repetir; una columna o una tabla cambian la forma de la base y no se deshacen
// solas; una fila de configuracion se ve igual en las dos puntas y se pisa sin avisar.
// El tipo sale de los objetos que el parser ya encontro en el SQL — no del nombre del archivo,
// que es justamente lo que este sistema NO puede dar por cierto.
export function tipoDeScript(script) {
  const tipos = new Set((script.objetos || []).map((o) => o.tipo));
  if (!tipos.size) return null;
  if (tipos.has('PROCEDURE') || tipos.has('FUNCTION')) return 'sp';
  // FILA es el unico objeto que no cambia el esquema: si hay CUALQUIER otro, el script mueve
  // estructura y se mira con esa vara, aunque tambien inserte datos.
  if ([...tipos].every((t) => t === 'FILA')) return 'datos';
  return 'estructura';
}

// El modelo que consume la pantalla. Es una PROYECCION del reporte, no un segundo calculo:
// bloqueantes, veredicto, desvios y agrupados se copian tal cual. Si la pantalla recalculara
// aunque sea uno, la consola y el tablero podrian contradecirse y no habria forma de saber
// cual de los dos miente.
export function construirVista(reporte, extra = {}) {
  const { org = null, proyecto = null, medido = null, sprint = null, iteracion = null, comando = null } = extra;

  const filas = reporte.orden.map((s) => {
    const est = {};
    for (const amb of reporte.ambientes) est[amb] = reporte.estados?.[s.id]?.[amb]?.estado ?? '-';
    const wi = reporte.wis.find((w) => w.id === s.wiId) || null;
    return {
      id: s.id,
      arch: s.archivo,
      wi: s.wiId ?? null,
      pre: !!s.esPre,
      acc: s.accion ?? null,
      desc: s.descripcion || s.archivo,
      tipo: tipoDeScript(s),
      obj: [...new Set((s.objetos || []).map((o) => o.nombre).filter(Boolean))],
      est,
      via: s.vinculadoPor ?? null,
      padre: s.contenedorPadre ?? null,
      wiEstado: wi?.estado ?? null,
      wiTit: wi?.titulo ?? null,
      resp: responsableDe(s, reporte.wis),
    };
  });

  const porTipo = {};
  for (const f of filas) if (f.tipo) porTipo[f.tipo] = (porTipo[f.tipo] || 0) + 1;

  return {
    meta: {
      destino: reporte.destino,
      ambientes: reporte.ambientes,
      bloqueantes: reporte.bloqueantes,
      listo: reporte.listoParaSubir,
      // Sin organizacion configurada no hay link: un href a medias manda al que lo aprieta a
      // una pagina que no existe, y eso se lee como "el work item no esta".
      wiBase: org && proyecto ? `${String(org).replace(/\/+$/, '')}/${proyecto}/_workitems/edit/` : null,
      medido, sprint, iteracion, comando, porTipo,
      total: filas.length,
    },
    filas,
    desvios: reporte.desvios,
    personas: reporte.pendientesPorResponsable,
    revisar: reporte.revisarAMano,
    sinVeredicto: reporte.sinVeredicto || [],
  };
}
