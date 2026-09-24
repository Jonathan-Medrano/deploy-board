import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idDeScript, armarScriptParcial, esRespaldo, esRespaldoViejo, esVersionNueva } from '../../src/fuentes/comun.js';
import { descubrirRepoEnAdo } from '../../src/fuentes/repoAdo.js';
import { reconciliar } from '../../src/reconciliador/index.js';
import { detectarDesvios } from '../../src/desvios/reglas.js';

test('esRespaldo reconoce __OLD y __NEW sin importar mayusculas', () => {
  assert.equal(esRespaldo('a__OLD.sql'), true);
  assert.equal(esRespaldo('A__old.SQL'), true);
  assert.equal(esRespaldo('a__NEW.sql'), true);
});

test('esRespaldo no confunde OLD/NEW sueltos o con otra extension', () => {
  assert.equal(esRespaldo('a_OLD.sql'), false);
  assert.equal(esRespaldo('aOLD.sql'), false);
  assert.equal(esRespaldo('a__OLD.txt'), false);
});

test('esRespaldoViejo es solo __OLD y esVersionNueva solo __NEW', () => {
  assert.equal(esRespaldoViejo('a__OLD.sql'), true);
  assert.equal(esRespaldoViejo('A__old.SQL'), true);
  assert.equal(esRespaldoViejo('a__NEW.sql'), false);
  assert.equal(esVersionNueva('a__NEW.sql'), true);
  assert.equal(esVersionNueva('A__new.Sql'), true);
  assert.equal(esVersionNueva('a__OLD.sql'), false);
  assert.equal(esVersionNueva('a_NEW.sql'), false);
});

test('el mismo script numerado distinto tiene el mismo id', () => {
  assert.equal(idDeScript(5, '[U-5] - 01 - Foo - ALTER.sql'), idDeScript(5, '[U-5] - 02 - Foo - ALTER.sql'));
});

test('marcarlo PRE no lo convierte en otro script', () => {
  assert.equal(idDeScript(5, '[U-5] - PRE - 01 - Foo - ALTER.sql'), idDeScript(5, '[U-5] - 01 - Foo - ALTER.sql'));
});

test('PRE antes o despues del NN da el mismo id', () => {
  assert.equal(idDeScript(5, '[U-5] - PRE - 01 - Foo - ALTER.sql'), idDeScript(5, '[U-5] - 01 - PRE - Foo - ALTER.sql'));
});

test('otra accion u otra descripcion es otro script', () => {
  assert.notEqual(idDeScript(5, '[U-5] - 01 - Foo - ALTER.sql'), idDeScript(5, '[U-5] - 01 - Foo - CREATE.sql'));
  assert.notEqual(idDeScript(5, '[U-5] - 01 - Foo - ALTER.sql'), idDeScript(5, '[U-5] - 01 - Bar - ALTER.sql'));
});

test('mayusculas y espacios de mas no cambian el id', () => {
  assert.equal(idDeScript(5, '[U-5] - 01 - Foo  Bar - ALTER.sql'), idDeScript(5, '[U-5] - 01 - foo bar - alter.sql'));
});

test('un nombre fuera de la convencion usa el nombre entero', () => {
  assert.equal(idDeScript(7, 'sp_X.sql'), '7/sp_x');
  assert.equal(idDeScript(null, 'sp_X.sql'), 'sin-wi/sp_x');
});

test('renumerado entre tarjeta y repo: UNA fila con D10, sin D5 ni D6', () => {
  const sql = 'ALTER TABLE dbo.T ADD c INT NULL';
  const scripts = reconciliar({
    adjuntos: [armarScriptParcial('[U-5] - 01 - Foo - ALTER.sql', sql, 'adjunto')],
    repo: [armarScriptParcial('[U-5] - 02 - Foo - ALTER.sql', sql, 'repo')],
  });
  assert.equal(scripts.length, 1);
  const codigos = detectarDesvios({ scripts, wis: [{ id: 5, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);
  assert.ok(codigos.includes('D10'), codigos.join(','));
  assert.equal(codigos.includes('D5') || codigos.includes('D6'), false, codigos.join(','));
});

test('SP sin id en el nombre, vinculado por contenedor de ambos lados: se empareja, sin D5 ni D6', () => {
  const sql = 'ALTER TABLE dbo.T ADD c INT NULL';
  const scripts = reconciliar({
    adjuntos: [armarScriptParcial('sp_algo.sql', sql, 'adjunto', { contenedorId: 30015, wiIdFallback: 30015 })],
    repo: [armarScriptParcial('sp_algo.sql', sql, 'repo', { carpeta: 'US-25051', wiIdFallback: 25051 })],
  });
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].wiId, 25051);
  assert.deepEqual([...scripts[0].fuentes].sort(), ['adjunto', 'repo']);
  const codigos = detectarDesvios({ scripts, wis: [{ id: 25051, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);
  assert.equal(codigos.includes('D5') || codigos.includes('D6'), false, codigos.join(','));
});

test('colision de ids: el resultado no depende del orden de llegada de ninguna de las dos fuentes', () => {
  const sqlA = 'ALTER TABLE dbo.Pedidos ADD colA INT NULL';
  const sqlB = 'ALTER TABLE dbo.Pedidos ADD colB INT NULL';
  const f01 = '[U-5] - 01 - Pedidos - ALTER.sql';
  const f02 = '[U-5] - 02 - Pedidos - ALTER.sql';
  const repo01 = () => armarScriptParcial(f01, sqlA, 'repo', { carpeta: 'US-5' });
  const repo02 = () => armarScriptParcial(f02, sqlB, 'repo', { carpeta: 'US-5' });
  const adj01 = () => armarScriptParcial(f01, sqlA, 'adjunto', { contenedorId: 900 });
  const adj02 = () => armarScriptParcial(f02, sqlB, 'adjunto', { contenedorId: 900 });
  const combos = [
    [[repo01(), repo02()], [adj01(), adj02()]],
    [[repo01(), repo02()], [adj02(), adj01()]],
    [[repo02(), repo01()], [adj01(), adj02()]],
    [[repo02(), repo01()], [adj02(), adj01()]],
  ];
  for (const [i, [repo, adjuntos]] of combos.entries()) {
    const scripts = reconciliar({ repo, adjuntos });
    assert.equal(scripts.length, 2, `combo ${i}: ${scripts.map((x) => x.id).join(',')}`);
    for (const sc of scripts) {
      assert.deepEqual([...sc.fuentes].sort(), ['adjunto', 'repo'], `combo ${i}`);
      assert.equal(sc.sql, sc.orden === 1 ? sqlA : sqlB, `combo ${i}: el ${sc.orden} tiene su propio sql`);
      assert.equal(sc.contenidoDistinto, false, `combo ${i}`);
    }
    const codigos = detectarDesvios({
      scripts, wis: [{ id: 5, estado: 'Active', cantidadScripts: 2 }], tasks: [], estados: {},
    }).map((d) => d.codigo);
    for (const c of ['D5', 'D6', 'D8', 'D10', 'D12']) {
      assert.equal(codigos.includes(c), false, `combo ${i}: ${codigos.join(',')}`);
    }
  }
});

const sqlV1 = 'ALTER TABLE dbo.Pedidos ADD colA INT NULL';
const sqlV2 = 'ALTER TABLE dbo.Pedidos ADD colA BIGINT NULL';
const sqlB2 = 'ALTER TABLE dbo.Pedidos ADD colB INT NULL';
const f01 = '[U-5] - 01 - Pedidos - ALTER.sql';
const f02 = '[U-5] - 02 - Pedidos - ALTER.sql';
const c3 = () => ({
  repo: [
    armarScriptParcial(f01, sqlV2, 'repo', { carpeta: 'US-5' }),
    armarScriptParcial(f02, sqlB2, 'repo', { carpeta: 'US-5' }),
  ],
  adjuntos: [
    armarScriptParcial(f01, sqlV1, 'adjunto', { contenedorId: 900, creado: '2026-09-10T10:00:00Z' }),
    armarScriptParcial(f01, sqlV2, 'adjunto', { contenedorId: 900, creado: '2026-09-20T10:00:00Z' }),
    armarScriptParcial(f02, sqlB2, 'adjunto', { contenedorId: 900, creado: '2026-09-15T10:00:00Z' }),
  ],
});

test('c2: el mismo sp_algo.sql subido dos veces a la misma task no es una colision', () => {
  const scripts = reconciliar({
    repo: [armarScriptParcial('sp_algo.sql', sqlV2, 'repo', { carpeta: 'US-25051', wiIdFallback: 25051 })],
    adjuntos: [
      armarScriptParcial('sp_algo.sql', sqlV1, 'adjunto', { contenedorId: 30015, wiIdFallback: 30015, creado: '2026-09-10T10:00:00Z' }),
      armarScriptParcial('sp_algo.sql', sqlV2, 'adjunto', { contenedorId: 30015, wiIdFallback: 30015, creado: '2026-09-20T10:00:00Z' }),
    ],
  });
  assert.equal(scripts.length, 1, scripts.map((x) => x.id).join(','));
  assert.deepEqual([...scripts[0].fuentes].sort(), ['adjunto', 'repo']);
  assert.equal(scripts[0].contenidoDistinto, true);
  const codigos = detectarDesvios({ scripts, wis: [{ id: 25051, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);
  assert.equal(codigos.filter((c) => c === 'D12').length, 1, codigos.join(','));
  assert.equal(codigos.includes('D5') || codigos.includes('D6'), false, codigos.join(','));
});

test('c3: repo 01+02, tarjeta con el 01 subido dos veces + 02: dos registros, D12 solo en el 01', () => {
  const scripts = reconciliar(c3());
  assert.equal(scripts.length, 2, scripts.map((x) => x.id).join(','));
  for (const sc of scripts) assert.deepEqual([...sc.fuentes].sort(), ['adjunto', 'repo']);
  const codigos = detectarDesvios({ scripts, wis: [{ id: 5, estado: 'Active', cantidadScripts: 2 }], tasks: [], estados: {} }).map((d) => d.codigo);
  for (const c of ['D5', 'D6', 'D8']) assert.equal(codigos.includes(c), false, codigos.join(','));
  const uno = scripts.find((x) => x.orden === 1);
  assert.equal(uno.contenidoDistinto, true);
  assert.equal(uno.sql, sqlV2, 'se mide el adjunto mas nuevo');
  assert.equal(scripts.find((x) => x.orden === 2).contenidoDistinto, false);
  assert.equal(codigos.filter((c) => c === 'D12').length, 1, codigos.join(','));
});

test('c9: tarjeta PRE-01 + 01 + 02, repo 01 + 02: el 01 del repo se une con el 01 de la tarjeta, no con el PRE', () => {
  const scripts = reconciliar({
    repo: [
      armarScriptParcial(f01, sqlV1, 'repo', { carpeta: 'US-5' }),
      armarScriptParcial(f02, sqlB2, 'repo', { carpeta: 'US-5' }),
    ],
    adjuntos: [
      armarScriptParcial('[U-5] - PRE - 01 - Pedidos - ALTER.sql', 'ALTER TABLE dbo.Pedidos ADD pre INT NULL', 'adjunto', { contenedorId: 900 }),
      armarScriptParcial(f01, sqlV1, 'adjunto', { contenedorId: 900 }),
      armarScriptParcial(f02, sqlB2, 'adjunto', { contenedorId: 900 }),
    ],
  });
  assert.equal(scripts.length, 3, scripts.map((x) => x.id).join(','));
  const solos = scripts.filter((x) => x.fuentes.length === 1);
  assert.equal(solos.length, 1);
  assert.equal(solos[0].esPre, true);
  assert.deepEqual(solos[0].fuentes, ['adjunto']);
  const codigos = detectarDesvios({ scripts, wis: [{ id: 5, estado: 'Active', cantidadScripts: 3 }], tasks: [], estados: {} }).map((d) => d.codigo);
  assert.equal(codigos.includes('D5'), false, codigos.join(','));
  assert.equal(codigos.includes('D8'), false, codigos.join(','));
  assert.equal(codigos.filter((c) => c === 'D6').length, 1, codigos.join(','));
});

test('c3 barajado: 20 permutaciones de las dos listas dan el mismo resultado', () => {
  let semilla = 12345;
  const azar = () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const barajar = (xs) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const huella = (scripts) => scripts.map((x) => `${x.id}|${[...x.fuentes].sort()}|${x.sql}`).sort();
  const esperado = huella(reconciliar(c3()));
  for (let i = 0; i < 20; i++) {
    const { repo, adjuntos } = c3();
    assert.deepEqual(huella(reconciliar({ repo: barajar(repo), adjuntos: barajar(adjuntos) })), esperado, `iteracion ${i}`);
  }
});

const sqlC1 = 'ALTER TABLE dbo.Pedidos ADD colA INT NULL';
const sqlC2 = 'ALTER TABLE dbo.Pedidos ADD colB INT NULL';
const sqlPre = 'ALTER TABLE dbo.Pedidos ADD pre INT NULL';
const r4a = () => ({
  repo: [armarScriptParcial(f02, sqlC2, 'repo', { carpeta: 'US-5' })],
  adjuntos: [
    armarScriptParcial(f01, sqlC1, 'adjunto', { contenedorId: 900 }),
    armarScriptParcial(f02, sqlC2, 'adjunto', { contenedorId: 900 }),
    armarScriptParcial(f01, sqlC1, 'adjunto', { contenedorId: 901 }),
  ],
});
const r4b = () => ({
  repo: [armarScriptParcial(f01, sqlC1, 'repo', { carpeta: 'US-5' })],
  adjuntos: [
    armarScriptParcial('[U-5] - PRE - 01 - Pedidos - ALTER.sql', sqlPre, 'adjunto', { contenedorId: 900 }),
    armarScriptParcial(f01, sqlC1, 'adjunto', { contenedorId: 900 }),
  ],
});

test('r4a: la colision se decide por fuente: el 01 de otra tarjeta no se cruza con el 02 del repo', () => {
  const scripts = reconciliar(r4a());
  assert.equal(scripts.length, 2, scripts.map((x) => x.id).join(','));
  const dos = scripts.find((x) => x.orden === 2);
  const uno = scripts.find((x) => x.orden === 1);
  assert.deepEqual([...dos.fuentes].sort(), ['adjunto', 'repo']);
  assert.equal(dos.sql, sqlC2);
  assert.ok(uno.id.endsWith('#1'), uno.id);
  assert.deepEqual(uno.fuentes, ['adjunto']);
  assert.equal(uno.versiones.length, 2);
  const codigos = detectarDesvios({ scripts, wis: [{ id: 5, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);
  assert.equal(codigos.filter((c) => c === 'D6').length, 1, codigos.join(','));
  for (const c of ['D5', 'D10', 'D12']) assert.equal(codigos.includes(c), false, codigos.join(','));
});

test('r4b: el emparejamiento de un lado respeta el PRE: el 01 del repo va con el 01 de la tarjeta', () => {
  const scripts = reconciliar(r4b());
  assert.equal(scripts.length, 2, scripts.map((x) => x.id).join(','));
  const uno = scripts.find((x) => !x.esPre);
  const pre = scripts.find((x) => x.esPre);
  assert.ok(uno.id.endsWith('#1'), uno.id);
  assert.deepEqual([...uno.fuentes].sort(), ['adjunto', 'repo']);
  assert.equal(uno.sql, sqlC1);
  assert.ok(pre.id.endsWith('#pre-1'), pre.id);
  assert.deepEqual(pre.fuentes, ['adjunto']);
});

test('r4a y r4b barajados: 20 permutaciones de cada uno dan el mismo resultado', () => {
  let semilla = 777;
  const azar = () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const barajar = (xs) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const huella = (scripts) => scripts.map((x) => `${x.id}|${[...x.fuentes].sort()}|${x.sql}`).sort();
  for (const fixture of [r4a, r4b]) {
    const esperado = huella(reconciliar(fixture()));
    for (let i = 0; i < 20; i++) {
      const { repo, adjuntos } = fixture();
      assert.deepEqual(huella(reconciliar({ repo: barajar(repo), adjuntos: barajar(adjuntos) })), esperado, `${fixture.name} iteracion ${i}`);
    }
  }
});

// B-25017 de punta a punta: el adjunto con la convencion y su copia commiteada como __NEW (con el
// __OLD al lado) son UN script con las dos fuentes. Ni D5 por el __NEW, ni D6 por el adjunto.
test('B-25017 de punta a punta: adjunto + __NEW commiteado no dan D5 ni D6', async () => {
  const sql = 'ALTER PROCEDURE [dbo].[GetPriceWithDiscountAndDiscount] @a INT AS SELECT @a';
  const carpeta = '/Api/DB_Migrations/Sprint_2026_09_02/BUG-25017_Descuento_Por_Proveedor_En_Carrito_Pedidos_Web';
  const rutas = [`${carpeta}/GetPriceWithDiscountAndDiscount__NEW.sql`, `${carpeta}/GetPriceWithDiscountAndDiscount__OLD.sql`];
  const ado = {
    listarArchivos: async () => rutas.map((ruta) => ({ ruta, esCarpeta: false })),
    descargarArchivo: async () => Buffer.from(sql, 'utf8'),
    ultimoCommitDe: async () => ({ nombre: 'Ana', fecha: '2026-09-10' }),
  };
  const repo = await descubrirRepoEnAdo(ado, { sprint: 'Sprint_2026_09_02' });
  const adjuntos = [armarScriptParcial('[B-25017] - Descuento por proveedor en GetPriceWithDiscountAndDiscount - ALTER.sql', sql, 'adjunto', { contenedorId: 30015, wiIdFallback: 30015 })];
  const scripts = reconciliar({ adjuntos, repo });
  assert.equal(scripts.length, 1, scripts.map((x) => x.id).join(','));
  const codigos = detectarDesvios({ scripts, wis: [{ id: 25017, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);
  for (const c of ['D5', 'D6', 'D12']) assert.equal(codigos.includes(c), false, codigos.join(','));
});
