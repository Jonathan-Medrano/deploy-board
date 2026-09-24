// "Hoy" es el dia de Argentina, no el de UTC: desde las 21:00 locales toISOString ya devuelve
// el dia siguiente, y el ultimo dia de un sprint el tablero abria en el sprint que viene.
const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function fechaLocal(d = new Date()) {
  return FORMATO.format(d);
}
