/* Helpers de la pantalla que se pueden testear sin DOM. Es un script clasico, no un modulo:
   la pantalla no tiene bundler, y los tests lo cargan con node:vm. */

/* Escapa para texto Y para atributos entre comillas. La version anterior usaba textContent
   + innerHTML, que no escapa comillas: un nombre de archivo con " cerraba el data-id y le
   inyectaba un atributo a la fila. Los nombres vienen de ADO y del repo, no son de fiar. */
var esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/* La fecha de HOY en Argentina, no en UTC: desde las 21:00 locales toISOString ya devuelve
   el dia siguiente. */
var hoy = function (d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d || new Date());
};

/* El tema que se ve: la eleccion guardada gana; sin eleccion (o con basura en el storage)
   manda el sistema operativo. */
var temaEfectivo = function (guardado, prefiereOscuro) {
  if (guardado === 'dark' || guardado === 'light') return guardado;
  return prefiereOscuro ? 'dark' : 'light';
};

var temaAlternado = function (tema) {
  return tema === 'dark' ? 'light' : 'dark';
};
