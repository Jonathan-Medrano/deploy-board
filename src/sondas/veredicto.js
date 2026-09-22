import crypto from 'node:crypto';
import { normalizarDefinicion } from '../parser/normalizar.js';

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

export function veredicto(sondas, respuestas, definiciones = {}) {
  // Sin sondas no hay nada que evaluar, y "nada que evaluar" NO es "todo en verde": el
  // `si === verdes.length` de mas abajo es vacuamente verdadero con la lista vacia, y eso
  // devolveria OK sobre un script que nadie pregunto. Un falso OK manda a alguien a no
  // ejecutar un script que si hacia falta.
  if (!sondas || !sondas.length) return { estado: '?', nota: 'sin sondas que evaluar' };
  const verdes = [];
  for (const s of sondas) {
    if (s.tipo === 'sin_sonda') return { estado: '?', nota: s.detalle };
    const r = respuestas[s.id];
    if (r === undefined) return { estado: '?', nota: `la sonda ${s.id} no volvio` };

    if (s.tipo === 'modulo') {
      // Que el objeto exista no prueba que corrio ESTE script: hay que comparar el cuerpo.
      const viva = definiciones[s.objeto];
      verdes.push(r === 'SI' && viva != null && md5(normalizarDefinicion(viva)) === s.esperado);
    } else {
      verdes.push(r === 'SI');
    }
  }
  const si = verdes.filter(Boolean).length;
  if (si === verdes.length) return { estado: 'OK' };
  if (si === 0) return { estado: 'FALTA' };
  return { estado: 'PARCIAL', nota: `${si}/${verdes.length} sondas en verde` };
}
