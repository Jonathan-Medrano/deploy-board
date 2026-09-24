import { sinComentarios } from './normalizar.js';

const ID = String.raw`\[?(?:(dbo)\]?\.\[?)?([A-Za-z0-9_]+)\]?`;

export function extraerObjetos(sql) {
  const out = [];
  const visto = new Set();
  const push = (o) => {
    const k = JSON.stringify(o);
    if (!visto.has(k)) { visto.add(k); out.push(o); }
  };

  // Todas las extracciones corren sobre el texto SIN comentarios: un "-- CREATE PROCEDURE
  // dbo.sp_viejo" o un "/* ALTER TABLE ... */" mencionado en un comentario no es un objeto
  // que el script haya tocado. NO se sacan strings (a diferencia de normalizarDefinicion):
  // la sonda de FILA lee el valor adentro de las comillas.
  const limpio = sinComentarios(sql);

  // TODOS los modulos del archivo, no solo el primero: con match sin g, un archivo con dos
  // procedures sondeaba uno y el otro quedaba sin medir.
  const reMod = new RegExp(String.raw`\b(?:CREATE|ALTER)(?:\s+OR\s+ALTER)?\s+(PROCEDURE|PROC|FUNCTION|VIEW|TRIGGER)\s+` + ID, 'gi');
  for (const mod of limpio.matchAll(reMod)) {
    const tipo = mod[1].toUpperCase() === 'PROC' ? 'PROCEDURE' : mod[1].toUpperCase();
    push({ tipo, esquema: mod[2] || 'dbo', nombre: mod[3] });
  }

  const reMax = new RegExp(String.raw`\bALTER\s+TABLE\s+` + ID + String.raw`\s+ALTER\s+COLUMN\s+\[?([A-Za-z0-9_]+)\]?\s+N?VARCHAR\s*\(\s*MAX\s*\)`, 'gi');
  for (const m of limpio.matchAll(reMax)) {
    push({ tipo: 'COLUMN_MAX', esquema: m[1] || 'dbo', nombre: m[3], tabla: m[2], columna: m[3] });
  }

  const reAdd = new RegExp(String.raw`\bALTER\s+TABLE\s+` + ID + String.raw`\s+ADD\s+\[?([A-Za-z0-9_]+)\]?\s+(BIT|INT|BIGINT|SMALLINT|TINYINT|NVARCHAR|VARCHAR|NCHAR|CHAR|DECIMAL|NUMERIC|MONEY|FLOAT|REAL|DATE|DATETIME2?|UNIQUEIDENTIFIER)\b`, 'gi');
  for (const m of limpio.matchAll(reAdd)) {
    push({ tipo: 'COLUMN', esquema: m[1] || 'dbo', nombre: m[3], tabla: m[2], columna: m[3] });
  }

  const reTabla = new RegExp(String.raw`\bCREATE\s+TABLE\s+` + ID, 'gi');
  for (const m of limpio.matchAll(reTabla)) {
    push({ tipo: 'TABLE', esquema: m[1] || 'dbo', nombre: m[2], tabla: m[2] });
  }

  const reFila = new RegExp(String.raw`IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+` + ID + String.raw`\s+WHERE\s+\[?([A-Za-z0-9_]+)\]?\s*=\s*('(?:[^']|'')*'|\d+)`, 'gi');
  for (const m of limpio.matchAll(reFila)) {
    push({ tipo: 'FILA', esquema: m[1] || 'dbo', nombre: m[2], tabla: m[2], columna: m[3], valor: m[4] });
  }

  // Los indices se extraen SIEMPRE, no solo cuando no hubo otro objeto. Un script que hace
  // CREATE TABLE + CREATE INDEX en el mismo cuerpo perderia el indice, y despues la tabla
  // existe, la sonda da OK y el indice nunca se creo: un falso verde en el camino que este
  // sistema existe para vigilar.
  const reIdx = new RegExp(String.raw`\bCREATE\s+(?:UNIQUE\s+)?(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX\s+\[?([A-Za-z0-9_]+)\]?\s+ON\s+` + ID, 'gi');
  for (const m of limpio.matchAll(reIdx)) {
    push({ tipo: 'INDEX', esquema: m[2] || 'dbo', nombre: m[1], tabla: m[3] });
  }

  return out;
}
