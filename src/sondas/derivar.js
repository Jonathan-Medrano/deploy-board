import crypto from 'node:crypto';
import { normalizarDefinicion } from '../parser/normalizar.js';

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

// Un script sin sonda derivable se reporta como "?" — nunca se asume que corrio.
export function derivarSondas(objetos, sql, archivo) {
  const sondas = [];
  const agregar = (s) => sondas.push({ id: `s${sondas.length}`, ...s });

  for (const o of objetos) {
    switch (o.tipo) {
      case 'PROCEDURE': case 'FUNCTION': case 'VIEW': case 'TRIGGER':
        agregar({ tipo: 'modulo', objeto: o.nombre, esperado: md5(normalizarDefinicion(sql)) });
        break;
      case 'COLUMN':     agregar({ tipo: 'columna', tabla: o.tabla, columna: o.columna }); break;
      case 'COLUMN_MAX': agregar({ tipo: 'columna_max', tabla: o.tabla, columna: o.columna }); break;
      case 'TABLE':      agregar({ tipo: 'tabla', tabla: o.tabla }); break;
      case 'FILA':       agregar({ tipo: 'fila', tabla: o.tabla, columna: o.columna, valor: o.valor }); break;
      case 'INDEX':      agregar({ tipo: 'indice', indice: o.nombre, tabla: o.tabla }); break;
    }
  }

  if (!sondas.length) agregar({ tipo: 'sin_sonda', detalle: `no pude derivar sonda de ${archivo}` });
  return sondas;
}
