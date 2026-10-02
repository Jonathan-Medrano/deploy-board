const ACCIONES = new Set(['CREATE', 'ALTER', 'DROP', 'INSERT', 'UPDATE', 'DELETE']);

// El id SIEMPRE sale del nombre del archivo, nunca de la carpeta ni del work item que lo
// contiene: una Task que junta los .sql de un sprint es un contenedor de almacenamiento,
// no el origen del cambio. Un [XXXXX] honesto se corrige mirando el archivo; un id
// deducido manda a alguien a leer el work item que no es.
// Un script que no corre en fidel_db lleva la base adelante: "[fidel_ml_db] - [U-25155] - ...".
// Sin reconocerlo, el resto del nombre no matcheaba la convencion (D7/D11 falsos) y el script
// se media contra dev_fidel_db, donde no tiene por que estar. `base` queda en null para fidel_db.
export function baseDelNombre(nombre) {
  const m = String(nombre).match(/^\[\s*([a-z0-9_]+_db)\s*\]\s*-\s*(.+)$/i);
  if (!m) return { base: null, resto: String(nombre) };
  const base = m[1].toLowerCase();
  return { base: base === 'fidel_db' ? null : base, resto: m[2] };
}

export function parsearNombre(archivo) {
  const { base: baseDeDatos, resto } = baseDelNombre(String(archivo).replace(/\.sql$/i, ''));
  const base = resto;
  const vacio = { archivo, base: baseDeDatos, wiTipo: null, wiId: null, esPre: false, orden: null, accion: null, descripcion: base };

  const con = base.match(/^\[\s*(?:([TBU])\s*-\s*)?(\d+)?\s*[X]*\s*\]\s*-\s*(.+)$/i);
  if (!con) return vacio;

  const wiTipo = con[1] ? con[1].toUpperCase() : null;
  const wiId = con[2] ? Number(con[2]) : null;

  const partes = con[3].split(' - ').map((s) => s.trim()).filter(Boolean);

  // El equipo escribe PRE en dos posiciones: antes del NN ("PRE - 01 - Desc") o justo
  // despues ("01 - PRE - Desc") — medido en los 5 scripts de la US-24994. Se acepta en
  // cualquiera de las dos, nunca en medio de la descripcion: solo cuenta si la parte ES
  // "pre" entera (case-insensitive, sin espacios), asi "Precio de lista" no dispara esto.
  let esPre = false;
  if (partes[0] && partes[0].toUpperCase() === 'PRE') { esPre = true; partes.shift(); }

  let orden = null;
  if (partes[0] && /^\d{1,2}$/.test(partes[0])) orden = Number(partes.shift());

  if (!esPre && partes[0] && partes[0].toUpperCase() === 'PRE') { esPre = true; partes.shift(); }

  let accion = null;
  if (partes.length > 1 && ACCIONES.has(partes[partes.length - 1].toUpperCase())) {
    accion = partes.pop().toUpperCase();
  }

  return { archivo, base: baseDeDatos, wiTipo, wiId, esPre, orden, accion, descripcion: partes.join(' - ') };
}
