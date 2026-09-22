import { decodificarSql } from '../parser/leerSql.js';
import { armarScriptParcial } from './comun.js';
import { parsearNombre } from '../parser/nombre.js';

export const REPO_POR_DEFECTO = 'Api.Net';
export const RAMA_POR_DEFECTO = 'dev';
export const CARPETA_POR_DEFECTO = '/Api/DB_Migrations';

// El lado del REPO leido de Azure en vez de una carpeta en disco. Sacarlo del disco obligaba
// a cada dev a tener el Api.Net clonado Y al dia; medido el 2026-09-22, un clon atrasado
// informaba que Sprint_2026_09_02 no existia cuando en la rama estaba. El origen no se
// desactualiza, y ademas el sistema deja de depender de que el otro repo este bajado.
export async function descubrirRepoEnAdo(ado, { sprint, repo = REPO_POR_DEFECTO, rama = RAMA_POR_DEFECTO, carpeta = CARPETA_POR_DEFECTO } = {}, deps = {}) {
  // El buffer ya esta en memoria: se decodifica directo. decodificarSql es el que sabe del
  // UTF-16LE con que SSMS guarda los .sql, que leido como UTF-8 devuelve "sin objetos" sin
  // tirar error — la trampa que ya costo caro una vez.
  const decodificar = deps.decodificarSql || decodificarSql;
  const items = await ado.listarArchivos(repo, carpeta, rama);

  const prefijo = `${carpeta}/${sprint}/`;
  const candidatos = items
    .filter((i) => !i.esCarpeta && i.ruta.startsWith(prefijo))
    .map((i) => ({ ruta: i.ruta, partes: i.ruta.slice(prefijo.length).split('/') }))
    // Solo la convencion. Los __OLD/__NEW quedan afuera solos: no empiezan con '['.
    .filter((c) => c.partes.length >= 2 && /^\[/.test(c.partes[c.partes.length - 1]) && /\.sql$/i.test(c.ruta));

  const out = [];
  for (const c of candidatos) {
    const nombre = c.partes[c.partes.length - 1];
    const carpetaWi = c.partes[0];
    try {
      const buf = await ado.descargarArchivo(repo, c.ruta, rama);
      out.push(armarScriptParcial(nombre, decodificar(buf), 'repo', {
        carpeta: carpetaWi,
        responsables: { commiteoEnElRepo: await ado.ultimoCommitDe(repo, c.ruta) },
      }));
    } catch (e) {
      // Un archivo ilegible es UN script sin veredicto, no un barrido caido. Y el NOMBRE
      // sigue siendo legible: nulear wiId/esPre/accion fabricaba desvios falsos sobre un
      // archivo bien nombrado. Solo se pierde lo que el contenido ilegible realmente niega.
      out.push({
        ...parsearNombre(nombre),
        id: `ilegible/${carpetaWi}/${nombre}`,
        objetos: [], sql: '', fuente: 'repo', carpeta: carpetaWi, responsables: {},
        sondas: [{ id: 's0', tipo: 'sin_sonda', detalle: `no pude bajar ${nombre}: ${e.message}` }],
      });
    }
  }
  return out;
}
