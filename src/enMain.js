import { defineModulo } from './fuentes/comun.js';

// Regla del equipo: si el .sql llego a la rama main de Api.Net, corrio en produccion. No hay
// base de produccion que consultar, asi que esto es la unica forma de saber "ya paso" sin
// conectarse a nada que este sistema tiene prohibido tocar.
//
// El contenido (hash) manda sobre el nombre: un archivo renombrado al commitear (mismo sql,
// otro nombre de tarjeta) ya corrio igual, y marcarlo "no subido" solo por el nombre distinto
// es un falso negativo. Al reves, un nombre igual con hash distinto NO es el mismo script que
// se va a subir ahora — main tiene OTRA version, y contarlo como hecho esconderia que lo que
// se sube todavia no llego.
// `hashCompartido` avisa que ESTE hash aparece en 2+ scripts del sprint (lo calcula
// marcarEnMain, que es quien conoce a todos los scripts — esta funcion solo ve uno por vez).
// Con el hash compartido, el contenido solo ya NO alcanza: dos scripts con el mismo SQL
// matchean el mismo archivo de main, y darle 'igual' a los dos es mentirle a uno de ellos
// sobre un commit que no hizo. Ahi hace falta ADEMAS el nombre para saber cual de los dos fue;
// si ninguno de los archivos de main con ese hash tiene el nombre de este script, queda en
// null — no se afirma nada, no se degrada a 'distinta' tampoco (el contenido SI esta en main,
// solo que no se puede saber si es el de este script o el de otro).
export function estadoEnMain(script, archivosDeMain, { hashCompartido = false } = {}) {
  const lista = archivosDeMain || [];

  const normalizar = (s) => String(s || '')
    .toLowerCase()
    .replace(/\.sql$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const nombreScript = normalizar(script.archivo);
  // Un archivo de main es ESTE script por nombre si se llama igual, o si es el `<X>__NEW.sql`
  // (la copia commiteada) del modulo X que el script define. Los __OLD nunca llegan aca: el
  // lector del repo los deja afuera.
  const esEsteNombre = (f) => {
    if (normalizar(f.archivo) === nombreScript) return true;
    const m = /^(.*)__NEW\.sql$/i.exec(String(f.archivo || ''));
    return !!m && defineModulo(script.objetos, m[1]);
  };

  // Hash primero: el contenido es lo que de verdad corrio en la base, el nombre es solo una
  // etiqueta. Los hash null (script ilegible) nunca matchean entre si — dos "no se pudo leer"
  // no son el mismo script.
  if (script.hash != null) {
    const porHash = lista.filter((f) => f.hash != null && f.hash === script.hash);
    if (porHash.length) {
      // Hash unico en el sprint: la regla de siempre, el nombre puede diferir.
      if (!hashCompartido) return 'igual';
      // Hash compartido: sin el nombre no hay forma de saber si ESTE script es el que llego.
      return porHash.some(esEsteNombre) ? 'igual' : null;
    }
  }

  if (lista.some(esEsteNombre)) return 'distinta';

  return null;
}

// Mapa listo para colgar del reporte: { [scriptId]: 'igual'|'distinta' }. Los null se omiten
// a proposito — el consumidor ya proyecta null por default (`reporte.enMain?.[id] ?? null`),
// y un mapa sin la clave es mas facil de leer que uno con `null` repetido en cada entrada.
export function marcarEnMain(scripts, archivosDeMain) {
  const lista = scripts || [];

  // Cuenta cuantos scripts del sprint comparten cada hash no nulo. Es la unica forma de saber,
  // ANTES de mirar main, si el hash de un script alcanza solo o necesita el nombre tambien.
  const conteoPorHash = new Map();
  for (const s of lista) {
    if (s.hash != null) conteoPorHash.set(s.hash, (conteoPorHash.get(s.hash) || 0) + 1);
  }

  const out = {};
  for (const s of lista) {
    const hashCompartido = s.hash != null && conteoPorHash.get(s.hash) > 1;
    const estado = estadoEnMain(s, archivosDeMain, { hashCompartido });
    if (estado) out[s.id] = estado;
  }
  return out;
}
