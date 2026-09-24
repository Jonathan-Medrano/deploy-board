import crypto from 'node:crypto';
import { parsearNombre } from '../parser/nombre.js';
import { extraerObjetos } from '../parser/objetos.js';
import { derivarSondas } from '../sondas/derivar.js';
import { normalizarDefinicion } from '../parser/normalizar.js';

// Huella del CONTENIDO, no del nombre: dos versiones con los mismos comentarios cambiados dan
// la misma huella; un cambio real de SQL da otra. La usan D12 y las marcas de main.
export function hashContenido(sql) {
  return crypto.createHash('md5').update(normalizarDefinicion(sql), 'utf8').digest('hex');
}

// Dos entradas son el MISMO script si coinciden en work item, descripcion y accion. El NN y
// el PRE NO entran: son justamente lo que D10 compara entre la tarjeta y el repo, y con el NN
// adentro del id un script renumerado quedaba como dos (D5 + D6) y D10 no podia dispararse.
// Un nombre fuera de la convencion no tiene descripcion confiable: se usa entero.
export function idDeScript(wiId, archivo) {
  const n = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const p = parsearNombre(archivo);
  const clave = p.accion && String(p.descripcion || '').trim()
    ? `${n(p.descripcion)}/${p.accion.toLowerCase()}`
    : n(String(archivo).replace(/\.sql$/i, ''));
  return `${wiId ?? 'sin-wi'}/${clave}`;
}

// Convencion del equipo para un SP que se modifica: junto al script se commitean dos copias.
// `X__OLD.sql` es el respaldo del cuerpo que YA esta en stage/main: nunca se ejecuta, no es un
// script del sprint. `X__NEW.sql` es el cuerpo NUEVO, o sea la copia commiteada del script que
// se adjunta a la tarjeta: en el repo es la prueba de que el adjunto esta versionado.
export function esRespaldoViejo(nombre) {
  return /__OLD\.sql$/i.test(String(nombre));
}

export function esVersionNueva(nombre) {
  return /__NEW\.sql$/i.test(String(nombre));
}

// Un __NEW se llama como el modulo que reemplaza. Solo los modulos (lo que se reemplaza entero
// con un ALTER) tienen __NEW: una tabla o una fila con ese nombre no es la misma cosa.
const TIPOS_MODULO = new Set(['PROCEDURE', 'FUNCTION', 'VIEW', 'TRIGGER']);
export function defineModulo(objetos, nombre) {
  const buscado = String(nombre || '').toLowerCase();
  return !!buscado && (objetos || []).some((o) => TIPOS_MODULO.has(o.tipo) && String(o.nombre || '').toLowerCase() === buscado);
}

// En la TARJETA los dos se dejan afuera: un __NEW adjunto no es el script que se sube (el que
// se sube respeta la convencion de nombre), asi que ninguno de los dos cuenta ni se mide.
export function esRespaldo(nombre) {
  return esRespaldoViejo(nombre) || esVersionNueva(nombre);
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
    hash: hashContenido(sql),
    sql, fuente, ...resto,
  };
}
