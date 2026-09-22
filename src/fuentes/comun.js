import { parsearNombre } from '../parser/nombre.js';
import { extraerObjetos } from '../parser/objetos.js';
import { derivarSondas } from '../sondas/derivar.js';

// Dos entradas son el MISMO script si coinciden en work item y nombre normalizado.
export function idDeScript(wiId, archivo) {
  const base = String(archivo).replace(/\.sql$/i, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${wiId ?? 'sin-wi'}/${base}`;
}

export function armarScriptParcial(archivo, sql, fuente, extra = {}) {
  const datos = parsearNombre(archivo);
  const objetos = extraerObjetos(sql);

  // El nombre manda cuando trae el id. Cuando no —y los SP nunca lo traen, medido: 9 de 27
  // scripts del sprint— se cae al work item que lo CONTIENE, que es un dato real y no una
  // deduccion sobre el nombre. Queda marcado en `vinculadoPor` para que el reporte diga
  // "por contenedor" en vez de dejar que se lea como si el nombre lo hubiera dicho:
  // un dato inferido que se presenta como medido es peor que no tenerlo.
  const porNombre = datos.wiId != null;
  const wiId = porNombre ? datos.wiId : (extra.wiIdFallback ?? null);
  const vinculadoPor = porNombre ? 'nombre' : (wiId != null ? 'contenedor' : null);
  const { wiIdFallback, ...resto } = extra;

  return {
    ...datos, wiId, vinculadoPor,
    id: idDeScript(wiId, archivo),
    objetos,
    sondas: derivarSondas(objetos, sql, archivo),
    sql, fuente, ...resto,
  };
}
