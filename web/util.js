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

/* Los repos que "Crear todos" va a crear: con cambios, sin PR activo y sin error, y solo si la
   tabla es del pase elegido. Crear con la tabla de otro pase seria crear el pase equivocado. */
var reposParaCrear = function (medido, parElegido) {
  if (!medido || medido.par !== parElegido) return [];
  return (medido.repos || [])
    .filter(function (f) { return !f.error && f.pendientes > 0 && !f.prActivo; })
    .map(function (f) { return f.repo; });
};

/* De a uno y en orden: cada creacion re-mide su repo en el servidor, y N pedidos juntos al
   mismo PAT es lo que hace que Azure conteste 429. Un repo que falla no frena a los demas. */
var crearEnSerie = function (repos, crearUno, alTerminarUno) {
  var resultados = [];
  return repos.reduce(function (cadena, repo) {
    return cadena.then(function () {
      return Promise.resolve().then(function () { return crearUno(repo); }).then(function (r) {
        return { repo: repo, ok: true, id: r.id, link: r.link };
      }, function (e) {
        return { repo: repo, ok: false, error: e.message, link: (e.body && e.body.link) || null };
      }).then(function (res) {
        resultados.push(res);
        alTerminarUno(res);
      });
    });
  }, Promise.resolve()).then(function () { return resultados; });
};
