import { decodificarSql } from '../parser/leerSql.js';
import { armarScriptParcial, esRespaldoViejo, esVersionNueva } from './comun.js';
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
    // Todo .sql dentro de la carpeta de un work item, salvo el respaldo __OLD. Antes solo
    // entraban los que empezaban con '[', y los SP —que nunca traen el id en el nombre—
    // quedaban siempre como "adjunto pero no en el repo" (D6 falso). El __NEW SI entra: es la
    // copia commiteada del adjunto, y el reconciliador lo une con el.
    .filter((c) => c.partes.length >= 2 && /\.sql$/i.test(c.ruta) && !esRespaldoViejo(c.ruta));

  const out = [];
  for (const c of candidatos) {
    out.push(await leerScriptDelRepo(ado, { repo, rama, ruta: c.ruta, carpetaWi: c.partes[0] }, { decodificarSql: decodificar }));
  }
  return out;
}

// Un .sql del repo, bajado de UNA rama puntual, listo para reconciliar y sondear. Lo usan el
// lado repo del sprint (rama dev) y el pase stage -> dev (rama de stage): la misma lectura en
// dos lugares se desincroniza en el primer arreglo.
export async function leerScriptDelRepo(ado, { repo = REPO_POR_DEFECTO, rama = RAMA_POR_DEFECTO, ruta, carpetaWi }, deps = {}) {
  const decodificar = deps.decodificarSql || decodificarSql;
  const nombre = ruta.split('/').pop();
  const numCarpeta = /(\d+)/.exec(carpetaWi || '');
  // El nombre del SP queda como viene en el archivo; el reconciliador lo compara sin
  // mayusculas contra los modulos que define el adjunto.
  const deNew = esVersionNueva(nombre) ? { esNew: true, nombreSp: nombre.replace(/__NEW\.sql$/i, '') } : {};
  try {
    const buf = await ado.descargarArchivo(repo, ruta, rama);
    return armarScriptParcial(nombre, decodificar(buf), 'repo', {
      carpeta: carpetaWi,
      responsables: { commiteoEnElRepo: await ado.ultimoCommitDe(repo, ruta, rama) },
      wiIdFallback: numCarpeta ? Number(numCarpeta[1]) : null,
      ...deNew,
    });
  } catch (e) {
    // Un archivo ilegible es UN script sin veredicto, no un barrido caido. Y el NOMBRE
    // sigue siendo legible: nulear wiId/esPre/accion fabricaba desvios falsos sobre un
    // archivo bien nombrado. Solo se pierde lo que el contenido ilegible realmente niega.
    return {
      ...parsearNombre(nombre),
      id: `ilegible/${carpetaWi}/${nombre}`,
      objetos: [], sql: '', fuente: 'repo', carpeta: carpetaWi, responsables: {},
      hash: null, ...deNew,
      sondas: [{ id: 's0', tipo: 'sin_sonda', detalle: `no pude bajar ${nombre}: ${e.message}` }],
    };
  }
}
