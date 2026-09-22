const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Los nombres de objeto y el valor testigo se interpolan en el TEXTO del SQL, asi que se
// validan aca y no se confia en que el regex de objetos.js los haya acotado: este modulo
// esta exportado y cualquier productor futuro puede armar una Sonda a mano. Una sonda que
// no encaja no se "arregla" ni se saltea en silencio: se rechaza, y medirAmbiente la
// convierte en "?" — el veredicto honesto, porque no se pudo preguntar.
const ident = (v, campo) => {
  if (!/^[A-Za-z0-9_]+$/.test(String(v ?? ''))) {
    throw new Error(`Sonda invalida: ${campo} no es un identificador SQL simple (${String(v).slice(0, 60)})`);
  }
  return v;
};

const literal = (v) => {
  const s = String(v ?? '');
  if (!/^('(?:[^']|'')*'|\d+)$/.test(s)) {
    throw new Error(`Sonda invalida: el valor testigo no es un literal SQL (${s.slice(0, 60)})`);
  }
  return s;
};

// Una sola consulta con todas las sondas de si/no, para no abrir veinte conexiones.
// Las definiciones de modulo van aparte: son texto largo y sqlcmd las trunca.
export function consultaDeSondas(sondas) {
  const lineas = sondas.map((s) => {
    const id = q(s.id);
    const obj = (t) => q('dbo.' + t);
    switch (s.tipo) {
      case 'columna':
        return `SELECT ${id} AS sonda, CASE WHEN COL_LENGTH(${obj(s.tabla)}, ${q(s.columna)}) IS NULL THEN 'NO' ELSE 'SI' END AS valor`;
      case 'tabla':
        return `SELECT ${id}, CASE WHEN OBJECT_ID(${obj(s.tabla)}) IS NULL THEN 'NO' ELSE 'SI' END`;
      case 'columna_max':
        return `SELECT ${id}, ISNULL((SELECT CASE WHEN max_length = -1 THEN 'SI' ELSE 'NO' END FROM sys.columns WHERE object_id = OBJECT_ID(${obj(s.tabla)}) AND name = ${q(s.columna)}), 'NO')`;
      case 'fila':
        return `SELECT ${id}, CASE WHEN OBJECT_ID(${obj(s.tabla)}) IS NULL THEN 'NO' WHEN EXISTS (SELECT 1 FROM [dbo].[${ident(s.tabla, 'tabla')}] WHERE [${ident(s.columna, 'columna')}] = ${literal(s.valor)}) THEN 'SI' ELSE 'NO' END`;
      case 'indice':
        return `SELECT ${id}, CASE WHEN EXISTS (SELECT 1 FROM sys.indexes WHERE name = ${q(s.indice)} AND object_id = OBJECT_ID(${obj(s.tabla)})) THEN 'SI' ELSE 'NO' END`;
      case 'modulo':
        return `SELECT ${id}, CASE WHEN OBJECT_ID(${obj(s.objeto)}) IS NULL THEN 'NO' ELSE 'SI' END`;
      default:
        return null;
    }
  }).filter(Boolean);

  if (!lineas.length) return null;
  return 'SET NOCOUNT ON;\n' + lineas.join('\nUNION ALL\n') + ';';
}

export function consultaDefinicion(objeto) {
  return `SET NOCOUNT ON; SELECT m.definition FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id WHERE o.name = ${q(objeto)};`;
}
