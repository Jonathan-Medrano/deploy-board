import test from 'node:test';
import assert from 'node:assert/strict';
import { descubrirRepoEnAdo, RAMA_POR_DEFECTO } from '../../src/fuentes/repoAdo.js';

const CARPETA = '/Api/DB_Migrations';
const SPRINT = 'Sprint_2026_09_01';
const N1 = '[U-100] - PRE - Algo - ALTER.sql';
const N2 = '[B-200] - 02 - Otro - INSERT.sql';

function adoFalso(archivos, contenidos = {}, extra = {}) {
  const pedidos = [];
  return {
    pedidos,
    listarArchivos: async () => archivos.map((r) => ({ ruta: r, esCarpeta: r.endsWith('/') })),
    descargarArchivo: async (repo, ruta) => {
      pedidos.push(ruta);
      if (extra.fallaAl === ruta) throw new Error('no se pudo bajar');
      return Buffer.from(contenidos[ruta] ?? 'ALTER TABLE Producto ADD X BIT NULL;', 'utf8');
    },
    // Con ?? un null explicito caia al valor por defecto y el test no probaba nada.
    ultimoCommitDe: async () => ('commit' in extra ? extra.commit : { nombre: 'Ana Maria Gonzalez', fecha: '2026-09-07' }),
  };
}

test('toma solo los .sql del sprint pedido', async () => {
  const ado = adoFalso([
    `${CARPETA}/${SPRINT}/US-1/${N1}`,
    `${CARPETA}/Sprint_2026_08_02/US-9/${N2}`,
  ]);
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.equal(r.length, 1);
  assert.equal(r[0].archivo, N1);
});

test('los archivos fuera de la convencion quedan afuera, como en disco', async () => {
  const ado = adoFalso([
    `${CARPETA}/${SPRINT}/US-1/${N1}`,
    `${CARPETA}/${SPRINT}/US-1/sp_algo__OLD.sql`,
    `${CARPETA}/${SPRINT}/US-1/notas.txt`,
  ]);
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.deepEqual(r.map((x) => x.archivo), [N1]);
});

test('la carpeta del work item se conserva: es como se agrupan los scripts de una tarjeta', async () => {
  const ado = adoFalso([`${CARPETA}/${SPRINT}/US-24322_Buscar/${N1}`]);
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.equal(r[0].carpeta, 'US-24322_Buscar');
});

test('cada script queda con quien lo commiteo', async () => {
  const ado = adoFalso([`${CARPETA}/${SPRINT}/US-1/${N1}`]);
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.deepEqual(r[0].responsables.commiteoEnElRepo, { nombre: 'Ana Maria Gonzalez', fecha: '2026-09-07' });
});

test('sin commit el desvio sale SIN nombre, nunca con uno inventado', async () => {
  const ado = adoFalso([`${CARPETA}/${SPRINT}/US-1/${N1}`], {}, { commit: null });
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.equal(r[0].responsables.commiteoEnElRepo, null);
});

test('un archivo que no se puede bajar es UN script sin veredicto, no un barrido caido', async () => {
  const ruta = `${CARPETA}/${SPRINT}/US-1/${N1}`;
  const ado = adoFalso([ruta, `${CARPETA}/${SPRINT}/US-1/${N2}`], {}, { fallaAl: ruta });
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.equal(r.length, 2, 'el otro script tiene que seguir apareciendo');
  const roto = r.find((x) => x.archivo === N1);
  assert.equal(roto.sondas[0].tipo, 'sin_sonda');
  // El NOMBRE sigue siendo legible aunque el contenido no: nulear esto fabricaba desvios falsos.
  assert.equal(roto.wiId, 100);
  assert.equal(roto.esPre, true);
  assert.equal(roto.accion, 'ALTER');
});

test('el SQL bajado se parsea: de ahi salen los objetos que despues se sondean', async () => {
  const ruta = `${CARPETA}/${SPRINT}/US-1/${N1}`;
  const ado = adoFalso([ruta], { [ruta]: 'ALTER TABLE Producto ADD UtilizaPartidas BIT NULL;' });
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.ok(r[0].objetos.length > 0, 'no extrajo objetos');
});

test('un sprint que no existe en el repo devuelve vacio sin explotar', async () => {
  const ado = adoFalso([`${CARPETA}/Sprint_2026_08_02/US-9/${N2}`]);
  assert.deepEqual(await descubrirRepoEnAdo(ado, { sprint: SPRINT }), []);
});

test('la rama se puede elegir, y por defecto es la de integracion del Api.Net', async () => {
  let ramaUsada = null;
  const ado = {
    listarArchivos: async (repo, carpeta, rama) => { ramaUsada = rama; return []; },
    descargarArchivo: async () => Buffer.from(''),
    ultimoCommitDe: async () => null,
  };
  await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.equal(ramaUsada, RAMA_POR_DEFECTO);
  await descubrirRepoEnAdo(ado, { sprint: SPRINT, rama: 'main' });
  assert.equal(ramaUsada, 'main');
});

test('un SP sin id en el nombre entra y se vincula por la carpeta del work item', async () => {
  const ado = adoFalso([`${CARPETA}/${SPRINT}/US-25051/sp_algo.sql`]);
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.equal(r.length, 1);
  assert.equal(r[0].wiId, 25051);
  assert.equal(r[0].vinculadoPor, 'contenedor');
});

test('el respaldo __OLD sigue afuera: es el cuerpo que ya esta en stage/main', async () => {
  const ado = adoFalso([`${CARPETA}/${SPRINT}/US-1/sp_algo__OLD.sql`, `${CARPETA}/${SPRINT}/US-1/sp_algo__old.SQL`]);
  assert.equal((await descubrirRepoEnAdo(ado, { sprint: SPRINT })).length, 0);
});

test('el __NEW entra: es la copia commiteada del script adjunto', async () => {
  const ado = adoFalso([
    `${CARPETA}/${SPRINT}/BUG-25017_Descuento/GetPriceWithDiscountAndDiscount__NEW.sql`,
    `${CARPETA}/${SPRINT}/BUG-25017_Descuento/GetPriceWithDiscountAndDiscount__OLD.sql`,
  ]);
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.equal(r.length, 1);
  assert.equal(r[0].esNew, true);
  assert.equal(r[0].nombreSp, 'GetPriceWithDiscountAndDiscount');
  assert.equal(r[0].wiId, 25017);
  assert.equal(r[0].carpeta, 'BUG-25017_Descuento');
});

test('un __NEW ilegible sigue marcado como __NEW', async () => {
  const ruta = `${CARPETA}/${SPRINT}/BUG-25017_X/sp_a__NEW.sql`;
  const r = await descubrirRepoEnAdo(adoFalso([ruta], {}, { fallaAl: ruta }), { sprint: SPRINT });
  assert.equal(r[0].esNew, true);
  assert.equal(r[0].nombreSp, 'sp_a');
});

test('un script comun no queda marcado como __NEW', async () => {
  const r = await descubrirRepoEnAdo(adoFalso([`${CARPETA}/${SPRINT}/US-1/${N1}`]), { sprint: SPRINT });
  assert.equal(r[0].esNew, undefined);
});

test('una carpeta sin numero deja el script sin work item, no con uno inventado', async () => {
  const ado = adoFalso([`${CARPETA}/${SPRINT}/Varios/sp_algo.sql`]);
  const r = await descubrirRepoEnAdo(ado, { sprint: SPRINT });
  assert.equal(r[0].wiId, null);
});
