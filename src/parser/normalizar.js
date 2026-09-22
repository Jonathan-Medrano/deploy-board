// Deja el cuerpo comparable contra sys.sql_modules.definition: saca el preambulo
// (USE / GO / SET ...), comentarios, y colapsa espacios. CREATE y ALTER se unifican
// porque la base guarda siempre el verbo con el que quedo, no con el que se escribio.
export function normalizarDefinicion(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .split('\n')
    .filter((l) => !/^\s*(USE\s|GO\s*$|SET\s+(ANSI_NULLS|QUOTED_IDENTIFIER|NOCOUNT)\b)/i.test(l))
    .join('\n')
    .replace(/^\s*(CREATE|ALTER)(\s+OR\s+ALTER)?\s+/i, 'ALTER ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
