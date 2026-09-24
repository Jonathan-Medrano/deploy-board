// Saca comentarios de bloque (/* */) y de linea (-- hasta el fin de linea), pero es
// CONSCIENTE de los literales Y de los identificadores entre corchetes o comillas dobles:
// un '--' o '/*' adentro de una cadena ('...'), de un [identificador] o de un "identificador"
// no es un comentario, y sys.sql_modules o la sonda de FILA necesitan ese texto intacto.
// Barrido de una sola pasada con 4 modos (normal / literal / corchete / comilla doble):
// afuera de todos, ' abre un literal, [ abre un identificador entre corchetes y " abre uno
// entre comillas dobles. Adentro de cada uno, el caracter que lo abrio DUPLICADO ('', ]], "")
// es un escape (T-SQL) y sigue adentro; una sola vez lo cierra. Nada de esto intenta arreglar
// SQL mal formado (una comilla suelta sin cerrar): eso queda fuera de alcance.
export function sinComentarios(sql) {
  const texto = String(sql);
  let out = '';
  let i = 0;
  // 'normal' | 'literal' (') | 'corchete' ([...]) | 'doble' ("...")
  let modo = 'normal';
  const cierres = { literal: "'", corchete: ']', doble: '"' };

  while (i < texto.length) {
    const c = texto[i];

    if (modo !== 'normal') {
      const cierre = cierres[modo];
      if (c === cierre) {
        if (texto[i + 1] === cierre) { out += cierre + cierre; i += 2; continue; }
        modo = 'normal';
      }
      out += c;
      i += 1;
      continue;
    }

    if (c === "'") { modo = 'literal'; out += c; i += 1; continue; }
    if (c === '[') { modo = 'corchete'; out += c; i += 1; continue; }
    if (c === '"') { modo = 'doble'; out += c; i += 1; continue; }

    if (c === '-' && texto[i + 1] === '-') {
      let j = i + 2;
      while (j < texto.length && texto[j] !== '\n') j += 1;
      out += ' ';
      i = j;
      continue;
    }

    if (c === '/' && texto[i + 1] === '*') {
      const fin = texto.indexOf('*/', i + 2);
      out += ' ';
      i = fin === -1 ? texto.length : fin + 2;
      continue;
    }

    out += c;
    i += 1;
  }
  return out;
}

// Deja el cuerpo comparable contra sys.sql_modules.definition: saca el preambulo
// (USE / GO / SET ...), comentarios, y colapsa espacios. CREATE y ALTER se unifican
// porque la base guarda siempre el verbo con el que quedo, no con el que se escribio.
export function normalizarDefinicion(sql) {
  return sinComentarios(sql)
    .split('\n')
    .filter((l) => !/^\s*(USE\s|GO\s*$|SET\s+(ANSI_NULLS|QUOTED_IDENTIFIER|NOCOUNT)\b)/i.test(l))
    .join('\n')
    .replace(/^\s*(CREATE|ALTER)(\s+OR\s+ALTER)?\s+/i, 'ALTER ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// sys.sql_modules guarda el LOTE que creo el modulo, no el archivo: lo que va en otro lote
// (un DROP IF EXISTS antes, un GRANT despues, otro SP) no esta en la definicion viva. Se
// devuelve el lote que contiene el CREATE/ALTER de ese modulo; si no se encuentra, el archivo
// entero, que es lo que se hacia antes.
export function loteDelModulo(sql, nombre) {
  const texto = String(sql);
  const lotes = texto.split(/^[ \t]*GO[ \t]*\r?$/im);
  const re = new RegExp(
    String.raw`\b(?:CREATE|ALTER)(?:\s+OR\s+ALTER)?\s+(?:PROCEDURE|PROC|FUNCTION|VIEW|TRIGGER)\s+\[?(?:dbo\]?\.\[?)?` +
    nombre + String.raw`\]?(?![A-Za-z0-9_])`, 'i');
  // El ULTIMO lote que matchea es el que quedo vivo: un patron stub+ALTER (el clasico
  // "IF NOT EXISTS ... EXEC('CREATE PROCEDURE ...')" seguido de un ALTER real) define el
  // modulo dos veces, y sys.sql_modules guarda la version final, no la primera. Se testea
  // contra el texto sin comentarios para no elegir un lote donde el nombre solo aparece
  // mencionado en un comentario.
  for (let i = lotes.length - 1; i >= 0; i--) {
    if (re.test(sinComentarios(lotes[i]))) return lotes[i];
  }
  return texto;
}
