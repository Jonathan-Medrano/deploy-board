import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconciliar } from '../../src/reconciliador/index.js';
import { armarScriptParcial } from '../../src/fuentes/comun.js';
import { detectarDesvios } from '../../src/desvios/reglas.js';

const s = (id, fuente, extra = {}) => ({ id, archivo: id, wiId: 1, esPre: false, orden: null, objetos: [], sondas: [], sql: '', fuente, ...extra });

test('el mismo script en las dos fuentes se fusiona en uno', () => {
  const r = reconciliar({ adjuntos: [s('1/a', 'adjunto')], repo: [s('1/a', 'repo')] });
  assert.equal(r.length, 1);
  assert.deepEqual([...r[0].fuentes].sort(), ['adjunto', 'repo']);
});

test('solo en el repo: queda con una sola fuente (dispara D5)', () => {
  const r = reconciliar({ adjuntos: [], repo: [s('1/a', 'repo')] });
  assert.deepEqual(r[0].fuentes, ['repo']);
});

test('solo adjunto: queda con una sola fuente (dispara D6)', () => {
  const r = reconciliar({ adjuntos: [s('1/a', 'adjunto')], repo: [] });
  assert.deepEqual(r[0].fuentes, ['adjunto']);
});

test('el adjunto manda para el contenido: es lo que se sube al FileZilla', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { sql: 'ADJUNTO' })],
    repo: [s('1/a', 'repo', { sql: 'REPO' })],
  });
  assert.equal(r[0].sql, 'ADJUNTO');
});

test('el campo fuente singular desaparece del resultado', () => {
  const r = reconciliar({ adjuntos: [s('1/a', 'adjunto')], repo: [] });
  assert.equal('fuente' in r[0], false);
});

test('conserva las DOS numeraciones por separado, para que D10 pueda compararlas', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { orden: 2 })],
    repo: [s('1/a', 'repo', { orden: 1 })],
  });
  assert.deepEqual(r[0].ordenPorFuente, { adjunto: 2, repo: 1 });
});

test('acumula el responsable de cada fuente: son personas distintas', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { responsables: { subioElAdjunto: { nombre: 'Ana', fecha: '2026-09-17' } } })],
    repo: [s('1/a', 'repo', { responsables: { commiteoEnElRepo: { nombre: 'Emi', fecha: '2026-09-15' } } })],
  });
  assert.equal(r[0].responsables.subioElAdjunto.nombre, 'Ana');
  assert.equal(r[0].responsables.commiteoEnElRepo.nombre, 'Emi');
});

test('ordena por PRE primero, despues por wiId y orden', () => {
  const r = reconciliar({
    adjuntos: [
      s('2/b', 'adjunto', { wiId: 2, orden: 2 }),
      s('2/a', 'adjunto', { wiId: 2, orden: 1 }),
      s('9/z', 'adjunto', { wiId: 9, esPre: true }),
    ],
    repo: [],
  });
  assert.deepEqual(r.map((x) => x.id), ['9/z', '2/a', '2/b']);
});

test('mismo id con contenido distinto: se marca y se conservan las dos versiones', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { sql: 'ADJ', hash: 'h1', contenedorId: 900, creado: '2026-09-20' })],
    repo: [s('1/a', 'repo', { sql: 'REPO', hash: 'h2', carpeta: 'US-1' })],
  });
  assert.equal(r[0].contenidoDistinto, true);
  assert.equal(r[0].sql, 'ADJ');
  assert.deepEqual(r[0].versiones.map((v) => `${v.fuente}:${v.donde}`).sort(), ['adjunto:900', 'repo:US-1']);
});

test('mismo contenido en las dos fuentes: no hay desacuerdo', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { hash: 'h1' })],
    repo: [s('1/a', 'repo', { hash: 'h1' })],
  });
  assert.equal(r[0].contenidoDistinto, false);
});

test('dos adjuntos del mismo script: se mide el mas reciente, sin importar el orden de llegada', () => {
  const r = reconciliar({
    adjuntos: [
      s('1/a', 'adjunto', { sql: 'NUEVO', hash: 'h2', contenedorId: 500, creado: '2026-09-21T10:00:00Z' }),
      s('1/a', 'adjunto', { sql: 'VIEJO', hash: 'h1', contenedorId: 600, creado: '2026-09-10T10:00:00Z' }),
    ],
  });
  assert.equal(r[0].sql, 'NUEVO');
  assert.equal(r[0].contenidoDistinto, true);
});

test('un script ilegible (hash null) no dispara desacuerdo de contenido', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { hash: null })],
    repo: [s('1/a', 'repo', { hash: 'h1' })],
  });
  assert.equal(r[0].contenidoDistinto, false);
});

test('un SP sin id en el nombre vinculado por contenedor desde la tarjeta y la carpeta se emparejan si hay un solo candidato', () => {
  const r = reconciliar({
    adjuntos: [s('30015/sp_algo', 'adjunto', { vinculadoPor: 'contenedor', wiId: 30015, contenedorId: 30015, hash: 'h1' })],
    repo: [s('25051/sp_algo', 'repo', { vinculadoPor: 'contenedor', wiId: 25051, carpeta: 'US-25051', hash: 'h1' })],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, '25051/sp_algo');
  assert.equal(r[0].wiId, 25051);
  assert.deepEqual([...r[0].fuentes].sort(), ['adjunto', 'repo']);
  assert.equal(r[0].contenidoDistinto, false);
});

test('con dos repo candidatos, NO se emparejan (ambiguo)', () => {
  const r = reconciliar({
    adjuntos: [s('30015/sp_algo', 'adjunto', { vinculadoPor: 'contenedor', wiId: 30015, contenedorId: 30015 })],
    repo: [
      s('25051/sp_algo', 'repo', { vinculadoPor: 'contenedor', wiId: 25051, carpeta: 'US-25051' }),
      s('25099/sp_algo', 'repo', { vinculadoPor: 'contenedor', wiId: 25099, carpeta: 'US-25099' }),
    ],
  });
  assert.equal(r.length, 3);
});

test('un script vinculado por NOMBRE no se empareja por contenedor', () => {
  const r = reconciliar({
    adjuntos: [s('30015/sp_algo', 'adjunto', { vinculadoPor: 'nombre', wiId: 30015, contenedorId: 30015 })],
    repo: [s('25051/sp_algo', 'repo', { vinculadoPor: 'contenedor', wiId: 25051, carpeta: 'US-25051' })],
  });
  assert.equal(r.length, 2);
});

test('SP emparejados con contenido distinto se marcan', () => {
  const r = reconciliar({
    adjuntos: [s('30015/sp_algo', 'adjunto', { vinculadoPor: 'contenedor', wiId: 30015, contenedorId: 30015, hash: 'h1' })],
    repo: [s('25051/sp_algo', 'repo', { vinculadoPor: 'contenedor', wiId: 25051, carpeta: 'US-25051', hash: 'h2' })],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].contenidoDistinto, true);
});

test('el script emparejado conserva los aliases de su id viejo', () => {
  const r = reconciliar({
    adjuntos: [s('30015/sp_algo', 'adjunto', { vinculadoPor: 'contenedor', wiId: 30015, contenedorId: 30015 })],
    repo: [s('25051/sp_algo', 'repo', { vinculadoPor: 'contenedor', wiId: 25051, carpeta: 'US-25051' })],
  });
  assert.equal(r.length, 1);
  assert.ok(r[0].aliases && r[0].aliases.includes('30015/sp_algo'), 'el id viejo debe estar en aliases');
});

test('el script emparejado hereda contenedorPadre del repo side, no del adjunto', () => {
  const r = reconciliar({
    adjuntos: [s('30015/sp_algo', 'adjunto', { vinculadoPor: 'contenedor', wiId: 30015, contenedorId: 30015, contenedorPadre: 99000 })],
    repo: [s('25051/sp_algo', 'repo', { vinculadoPor: 'contenedor', wiId: 25051, carpeta: 'US-25051', contenedorPadre: null })],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].contenedorPadre, null, 'contenedorPadre del repo (null) debe prevalecer');
});

// Probe del final-fixes.md item 1: "[U-5] - 01 - Pedidos - ALTER.sql" (agrega columna a) y
// "[U-5] - 02 - Pedidos - ALTER.sql" (agrega columna b), ambos en la tarjeta 900 y en la
// carpeta US-5 del repo. Antes del fix, los dos NN se pierden en idDeScript y colapsan en UN
// solo registro: el script 01 nunca se prueba, D8 propone CantidadScripts=1, D12 dispara mal.
test('dos scripts DISTINTOS del mismo lugar (mismo id, mismo donde) no se fusionan entre si', () => {
  const r = reconciliar({
    repo: [
      s('5/pedidos/alter', 'repo', { wiId: 5, orden: 1, archivo: '[U-5] - 01 - Pedidos - ALTER.sql', carpeta: 'US-5' }),
      s('5/pedidos/alter', 'repo', { wiId: 5, orden: 2, archivo: '[U-5] - 02 - Pedidos - ALTER.sql', carpeta: 'US-5' }),
    ],
    adjuntos: [
      s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 1, archivo: '[U-5] - 01 - Pedidos - ALTER.sql', contenedorId: 900 }),
      s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 2, archivo: '[U-5] - 02 - Pedidos - ALTER.sql', contenedorId: 900 }),
    ],
  });
  assert.equal(r.length, 2, 'dos scripts distintos, no uno');
  for (const sc of r) {
    assert.deepEqual([...sc.fuentes].sort(), ['adjunto', 'repo'], JSON.stringify(sc));
    assert.equal(sc.versiones.length, 2);
  }
  assert.deepEqual(r.map((x) => x.orden), [1, 2], 'cada uno con su propio orden, sin pisarse');
});

test('solo la tarjeta tiene 01 y 02 (el repo no tiene ninguno de los dos): no se fusionan', () => {
  const r = reconciliar({
    repo: [],
    adjuntos: [
      s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 1, archivo: '[U-5] - 01 - Pedidos - ALTER.sql', contenedorId: 900 }),
      s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 2, archivo: '[U-5] - 02 - Pedidos - ALTER.sql', contenedorId: 900 }),
    ],
  });
  assert.equal(r.length, 2, 'dos scripts distintos, no uno');
});

test('renumerado entre tarjeta y repo (una sola tarjeta, un solo archivo del repo) sigue fusionando en 1 con D10', () => {
  // Mismo caso que ya cubria comun.test.js, repetido aca para dejar registrado que la
  // colision de re-key NO se dispara cuando fuente y donde son distintos: cruzar fuentes
  // sigue fusionando como antes.
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { orden: 1, contenedorId: 900 })],
    repo: [s('1/a', 'repo', { orden: 2, carpeta: 'US-1' })],
  });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].ordenPorFuente, { adjunto: 1, repo: 2 });
});

test('extremo a extremo: armarScriptParcial + reconciliar + detectarDesvios no colapsan los dos scripts', () => {
  const sqlA = 'ALTER TABLE dbo.Pedidos ADD colA INT NULL';
  const sqlB = 'ALTER TABLE dbo.Pedidos ADD colB INT NULL';
  const scripts = reconciliar({
    repo: [
      armarScriptParcial('[U-5] - 01 - Pedidos - ALTER.sql', sqlA, 'repo', { carpeta: 'US-5' }),
      armarScriptParcial('[U-5] - 02 - Pedidos - ALTER.sql', sqlB, 'repo', { carpeta: 'US-5' }),
    ],
    adjuntos: [
      armarScriptParcial('[U-5] - 01 - Pedidos - ALTER.sql', sqlA, 'adjunto', { contenedorId: 900 }),
      armarScriptParcial('[U-5] - 02 - Pedidos - ALTER.sql', sqlB, 'adjunto', { contenedorId: 900 }),
    ],
  });
  assert.equal(scripts.length, 2, 'dos scripts, cada uno con su propio SQL');
  for (const sc of scripts) {
    assert.deepEqual([...sc.fuentes].sort(), ['adjunto', 'repo']);
  }

  const codigos = detectarDesvios({
    scripts, wis: [{ id: 5, estado: 'Active', cantidadScripts: 2 }], tasks: [], estados: {},
  }).map((d) => d.codigo);
  assert.equal(codigos.includes('D12'), false, 'no hay desacuerdo de contenido: son scripts distintos, no versiones del mismo');
  assert.equal(codigos.includes('D8'), false, 'CantidadScripts=2 coincide con los 2 scripts reales');
  assert.equal(codigos.includes('D10'), false, 'cada uno esta numerado igual en las dos fuentes');
});

test('dos adjuntos del mismo nombre NO se emparejan con un repo (ambiguo)', () => {
  const r = reconciliar({
    adjuntos: [
      s('30015/sp_algo', 'adjunto', { vinculadoPor: 'contenedor', wiId: 30015, contenedorId: 30015 }),
      s('30016/sp_algo', 'adjunto', { vinculadoPor: 'contenedor', wiId: 30016, contenedorId: 30016 }),
    ],
    repo: [s('25051/sp_algo', 'repo', { vinculadoPor: 'contenedor', wiId: 25051, carpeta: 'US-25051' })],
  });
  assert.equal(r.length, 3, 'dos adjuntos + un repo sin merge');
});

test('la tarjeta tiene 01 y 02, el repo solo el 02: el 02 se fusiona por orden y el 01 queda solo adjunto', () => {
  const r = reconciliar({
    repo: [s('5/pedidos/alter', 'repo', { wiId: 5, orden: 2, archivo: '[U-5] - 02 - Pedidos - ALTER.sql', carpeta: 'US-5', hash: 'hB' })],
    adjuntos: [
      s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 1, archivo: '[U-5] - 01 - Pedidos - ALTER.sql', contenedorId: 900, hash: 'hA', sql: 'A' }),
      s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 2, archivo: '[U-5] - 02 - Pedidos - ALTER.sql', contenedorId: 900, hash: 'hB', sql: 'B' }),
    ],
  });
  assert.equal(r.length, 2, r.map((x) => x.id).join(','));
  const dos = r.find((x) => x.orden === 2);
  const uno = r.find((x) => x.orden === 1);
  assert.deepEqual([...dos.fuentes].sort(), ['adjunto', 'repo']);
  assert.ok((dos.aliases || []).includes('5/pedidos/alter'), 'el id base queda en aliases');
  assert.equal(dos.sql, 'B');
  assert.equal(dos.carpeta, 'US-5');
  assert.deepEqual(dos.ordenPorFuente, { adjunto: 2, repo: 2 });
  assert.equal(dos.contenidoDistinto, false);
  assert.deepEqual(uno.fuentes, ['adjunto']);
});

test('espejo: el repo tiene 01 y 02, la tarjeta solo el 01', () => {
  const r = reconciliar({
    repo: [
      s('5/pedidos/alter', 'repo', { wiId: 5, orden: 1, archivo: '[U-5] - 01 - Pedidos - ALTER.sql', carpeta: 'US-5', hash: 'hA' }),
      s('5/pedidos/alter', 'repo', { wiId: 5, orden: 2, archivo: '[U-5] - 02 - Pedidos - ALTER.sql', carpeta: 'US-5', hash: 'hB' }),
    ],
    adjuntos: [s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 1, archivo: '[U-5] - 01 - Pedidos - ALTER.sql', contenedorId: 900, hash: 'hA', sql: 'A' })],
  });
  assert.equal(r.length, 2, r.map((x) => x.id).join(','));
  const uno = r.find((x) => x.orden === 1);
  const dos = r.find((x) => x.orden === 2);
  assert.deepEqual([...uno.fuentes].sort(), ['adjunto', 'repo']);
  assert.ok((uno.aliases || []).includes('5/pedidos/alter'));
  assert.equal(uno.sql, 'A');
  assert.deepEqual(dos.fuentes, ['repo']);
});

test('PRE y no PRE con el mismo NN en la misma tarjeta: dos registros con ids distintos', () => {
  const r = reconciliar({
    adjuntos: [
      armarScriptParcial('[U-5] - PRE - 01 - Foo - ALTER.sql', 'ALTER TABLE dbo.T ADD a INT NULL', 'adjunto', { contenedorId: 900 }),
      armarScriptParcial('[U-5] - 01 - Foo - ALTER.sql', 'ALTER TABLE dbo.T ADD b INT NULL', 'adjunto', { contenedorId: 900 }),
    ],
  });
  assert.equal(r.length, 2);
  assert.notEqual(r[0].id, r[1].id);
  assert.ok(r.every((x) => x.id.includes('#') && x.idBase === '5/foo/alter'), r.map((x) => x.id).join(','));
});

test('mismo archivo en dos tarjetas distintas con contenido distinto: sigue siendo 1 registro con D12', () => {
  const scripts = reconciliar({
    adjuntos: [
      armarScriptParcial('[U-5] - 01 - Foo - ALTER.sql', 'ALTER TABLE dbo.T ADD a INT NULL', 'adjunto', { contenedorId: 500, creado: '2026-09-20' }),
      armarScriptParcial('[U-5] - 01 - Foo - ALTER.sql', 'ALTER TABLE dbo.T ADD b INT NULL', 'adjunto', { contenedorId: 600, creado: '2026-09-21' }),
    ],
  });
  assert.equal(scripts.length, 1);
  const codigos = detectarDesvios({ scripts, wis: [{ id: 5, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);
  assert.ok(codigos.includes('D12'), codigos.join(','));
});

test('D1 encuentra por el id base a los scripts que colisionaron en la tarjeta', () => {
  const scripts = reconciliar({
    adjuntos: [
      s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 1, archivo: '[U-5] - 01 - Pedidos - ALTER.sql', contenedorId: 900 }),
      s('5/pedidos/alter', 'adjunto', { wiId: 5, orden: 2, archivo: '[U-5] - 02 - Pedidos - ALTER.sql', contenedorId: 900 }),
    ],
  });
  const codigos = detectarDesvios({
    scripts, wis: [{ id: 5, estado: 'Resolved' }],
    tasks: [{ id: 900, estado: 'Active', adjuntos: ['5/pedidos/alter', '5/pedidos/alter'] }], estados: {},
  }).map((d) => d.codigo);
  assert.ok(codigos.includes('D1'), codigos.join(','));
});

test('re-subida sin fecha: el adjunto medido no depende del orden de llegada', () => {
  const v1 = s('5/foo/alter', 'adjunto', { wiId: 5, contenedorId: 900, sql: 'V1', hash: 'h1' });
  const v2 = s('5/foo/alter', 'adjunto', { wiId: 5, contenedorId: 900, sql: 'V2', hash: 'h2' });
  const a = reconciliar({ adjuntos: [v1, v2] });
  const b = reconciliar({ adjuntos: [v2, v1] });
  assert.equal(a.length, 1);
  assert.equal(a[0].sql, b[0].sql);
});

test('re-subida con la misma fecha: el adjunto medido no depende del orden de llegada', () => {
  const v1 = s('5/foo/alter', 'adjunto', { wiId: 5, contenedorId: 900, sql: 'V1', hash: 'h1', creado: '2026-09-20T10:00:00Z' });
  const v2 = s('5/foo/alter', 'adjunto', { wiId: 5, contenedorId: 900, sql: 'V2', hash: 'h2', creado: '2026-09-20T10:00:00Z' });
  const a = reconciliar({ adjuntos: [v1, v2] });
  const b = reconciliar({ adjuntos: [v2, v1] });
  assert.equal(a.length, 1);
  assert.equal(a[0].sql, b[0].sql);
});

// El mismo SP sin id adjunto a la US y a la task de scripts de esa US.
const enUS = (extra = {}) => s('24768/sp_x', 'adjunto', {
  archivo: 'sp_x.sql', vinculadoPor: 'contenedor', wiId: 24768, contenedorId: 24768, contenedorTipo: 'User Story',
  sql: 'US', hash: 'h1', creado: '2026-09-20T10:00:00Z', ...extra,
});
const enTask = (extra = {}) => s('25170/sp_x', 'adjunto', {
  archivo: 'sp_x.sql', vinculadoPor: 'contenedor', wiId: 25170, contenedorId: 25170, contenedorTipo: 'Task', contenedorTitulo: 'US-24768_Filtro_Categoria_Clie',
  sql: 'US', hash: 'h1', creado: '2026-09-20T10:00:00Z', ...extra,
});

test('el mismo adjunto sin id en la US y en la task de scripts es UNA fila, colgada de la US', () => {
  const r = reconciliar({ adjuntos: [enTask(), enUS()] });
  assert.equal(r.length, 1, r.map((x) => x.id).join(','));
  assert.equal(r[0].id, '24768/sp_x');
  assert.equal(r[0].wiId, 24768);
  assert.ok(r[0].aliases.includes('25170/sp_x'));
  assert.equal(r[0].contenidoDistinto, false);
  assert.equal(r[0].versiones.length, 2);
  assert.deepEqual(r[0].fuentes, ['adjunto']);
});

test('US y task con contenido distinto: una fila, D12 una vez, se mide el ganador de la tupla', () => {
  const scripts = reconciliar({
    adjuntos: [
      enUS({ sql: 'VIEJO', hash: 'h1', creado: '2026-09-10T10:00:00Z' }),
      enTask({ sql: 'NUEVO', hash: 'h2', creado: '2026-09-21T10:00:00Z' }),
    ],
  });
  assert.equal(scripts.length, 1);
  const x = scripts[0];
  assert.equal(x.wiId, 24768);
  assert.equal(x.contenidoDistinto, true);
  assert.equal(x.sql, 'NUEVO');
  assert.equal(x.hash, 'h2');
  assert.equal(x.contenedorId, 25170);
  const d = detectarDesvios({ scripts, wis: [{ id: 24768, estado: 'Active' }], tasks: [], estados: {} })
    .filter((y) => y.codigo === 'D12');
  assert.equal(d.length, 1);
});

test('la fila unida de US y task se sigue emparejando con el repo de la carpeta de la US', () => {
  const r = reconciliar({
    adjuntos: [enUS(), enTask()],
    repo: [s('24768/sp_x', 'repo', { archivo: 'sp_x.sql', vinculadoPor: 'contenedor', wiId: 24768, carpeta: 'US-24768', hash: 'h1' })],
  });
  assert.equal(r.length, 1, r.map((x) => x.id).join(','));
  assert.deepEqual([...r[0].fuentes].sort(), ['adjunto', 'repo']);
  assert.equal(r[0].wiId, 24768);
});

test('la fila unida se empareja por contenedor con un repo de otra carpeta', () => {
  const r = reconciliar({
    adjuntos: [enUS(), enTask()],
    repo: [s('30000/sp_x', 'repo', { archivo: 'sp_x.sql', vinculadoPor: 'contenedor', wiId: 30000, carpeta: 'US-30000', hash: 'h1' })],
  });
  assert.equal(r.length, 1, r.map((x) => x.id).join(','));
  assert.ok(r[0].aliases.includes('25170/sp_x'));
  assert.ok(r[0].aliases.includes('24768/sp_x'));
});

test('dos contenedores que no son Task: no se unen, elegir seria adivinar', () => {
  const r = reconciliar({
    adjuntos: [enUS(), enTask({ id: '24999/sp_x', wiId: 24999, contenedorId: 24999, contenedorTipo: 'User Story' })],
  });
  assert.equal(r.length, 2);
});

test('solo tasks: no se unen', () => {
  const r = reconciliar({
    adjuntos: [enTask(), enTask({ id: '25171/sp_x', wiId: 25171, contenedorId: 25171 })],
  });
  assert.equal(r.length, 2);
});

test('la union de US y task no depende del orden de los adjuntos', () => {
  let semilla = 7;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
  const lista = [
    enUS({ sql: 'A', hash: 'hA', creado: '2026-09-20T10:00:00Z' }),
    enTask({ sql: 'B', hash: 'hB', creado: '2026-09-20T10:00:00Z' }),
    enTask({ id: '25171/sp_x', wiId: 25171, contenedorId: 25171, sql: 'C', hash: 'hC', creado: '2026-09-20T10:00:00Z' }),
    s('24768/otro', 'adjunto', { archivo: 'otro.sql', vinculadoPor: 'contenedor', wiId: 24768, contenedorId: 24768, contenedorTipo: 'User Story', hash: 'hO' }),
  ];
  const firma = (r) => r.map((x) => JSON.stringify([x.id, [...x.fuentes].sort(), x.sql, x.contenidoDistinto])).sort();
  const base = firma(reconciliar({ adjuntos: lista }));
  assert.equal(base.length, 2);
  for (let i = 0; i < 20; i++) {
    const mezcla = lista.map((x) => ({ ...x }));
    for (let j = mezcla.length - 1; j > 0; j--) {
      const k = Math.floor(azar() * (j + 1));
      [mezcla[j], mezcla[k]] = [mezcla[k], mezcla[j]];
    }
    assert.deepEqual(firma(reconciliar({ adjuntos: mezcla })), base);
  }
});

test('D1 encuentra por alias el adjunto de la task de scripts que quedo unido a la US', () => {
  const scripts = reconciliar({ adjuntos: [enUS(), enTask()] });
  const d1 = detectarDesvios({
    scripts, wis: [{ id: 24768, estado: 'Resolved' }],
    tasks: [{ id: 25170, estado: 'Active', adjuntos: ['25170/sp_x'] }], estados: {},
  }).filter((d) => d.codigo === 'D1');
  assert.equal(d1.length, 1);
  assert.equal(d1[0].wiId, 24768);
});

test('extremo a extremo: SP sin id en la US y en la task de scripts, con el repo, es una fila sin D12', () => {
  const sql = 'CREATE PROCEDURE dbo.sp_x AS SELECT 1';
  const scripts = reconciliar({
    adjuntos: [
      armarScriptParcial('sp_x.sql', sql, 'adjunto', { contenedorId: 25170, contenedorTipo: 'Task', contenedorTitulo: 'US-24768_Filtro_Categoria_Clie', wiIdFallback: 25170, creado: '2026-09-20T10:00:00Z' }),
      armarScriptParcial('sp_x.sql', sql, 'adjunto', { contenedorId: 24768, contenedorTipo: 'User Story', wiIdFallback: 24768, creado: '2026-09-19T10:00:00Z' }),
    ],
    repo: [armarScriptParcial('sp_x.sql', sql, 'repo', { carpeta: 'US-24768', wiIdFallback: 24768 })],
  });
  assert.equal(scripts.length, 1, scripts.map((x) => x.id).join(','));
  assert.equal(scripts[0].wiId, 24768);
  assert.deepEqual([...scripts[0].fuentes].sort(), ['adjunto', 'repo']);
  const codigos = detectarDesvios({
    scripts, wis: [{ id: 24768, estado: 'Active' }],
    tasks: [{ id: 25170, estado: 'Active', adjuntos: ['25170/sp_x'] }], estados: {},
  }).map((d) => d.codigo);
  assert.equal(codigos.includes('D12'), false, codigos.join(','));
  assert.equal(codigos.includes('D5'), false, codigos.join(','));
  assert.equal(codigos.includes('D6'), false, codigos.join(','));
});

test('la task de scripts se une a la US de la que cuelga aunque el titulo no la nombre', () => {
  const r = reconciliar({ adjuntos: [enUS(), enTask({ contenedorTitulo: 'Scripts', contenedorPadre: 24768 })] });
  assert.equal(r.length, 1, r.map((x) => x.id).join(','));
});

test('una task cuyo titulo nombra OTRA US no se une', () => {
  for (const titulo of ['US-24999_Otra', 'US-247680_Otra', 'Scripts sprint']) {
    const r = reconciliar({ adjuntos: [enUS(), enTask({ contenedorTitulo: titulo })] });
    assert.equal(r.length, 2, titulo);
  }
});

test('la copia de la task cuyo id tambien vino del repo no se mueve: ya tiene par', () => {
  const r = reconciliar({
    adjuntos: [enUS(), enTask()],
    repo: [s('25170/sp_x', 'repo', { archivo: 'sp_x.sql', vinculadoPor: 'contenedor', wiId: 25170, carpeta: 'US-25170', hash: 'h1' })],
  });
  assert.equal(r.length, 2, r.map((x) => x.id).join(','));
  assert.deepEqual([...r.find((x) => x.id === '25170/sp_x').fuentes].sort(), ['adjunto', 'repo']);
  assert.deepEqual(r.find((x) => x.id === '24768/sp_x').fuentes, ['adjunto']);
});

test('01 y 02 en la US y en la task, el repo solo el 01: un solo resultado con cualquier orden', () => {
  const sqlA = 'ALTER TABLE dbo.T ADD a INT NULL';
  const sqlB = 'ALTER TABLE dbo.T ADD b INT NULL';
  const us = { contenedorId: 24768, contenedorTipo: 'User Story', contenedorTitulo: 'Filtro', wiIdFallback: 24768, creado: '2026-09-19T10:00:00Z' };
  const tk = { contenedorId: 25170, contenedorTipo: 'Task', contenedorTitulo: 'US-24768_Filtro_Categoria_Clie', wiIdFallback: 25170, creado: '2026-09-20T10:00:00Z' };
  const adjuntos = [
    armarScriptParcial('[U-XXXXX] - 01 - sp_x - ALTER.sql', sqlA, 'adjunto', us),
    armarScriptParcial('[U-XXXXX] - 02 - sp_x - ALTER.sql', sqlB, 'adjunto', us),
    armarScriptParcial('[U-XXXXX] - 01 - sp_x - ALTER.sql', sqlA, 'adjunto', tk),
    armarScriptParcial('[U-XXXXX] - 02 - sp_x - ALTER.sql', sqlB, 'adjunto', tk),
  ];
  const repo = [
    armarScriptParcial('[U-XXXXX] - 01 - sp_x - ALTER.sql', sqlA, 'repo', { carpeta: 'US-24768', wiIdFallback: 24768 }),
    s('9/otro', 'repo', { wiId: 9, carpeta: 'US-9' }),
  ];
  let semilla = 11;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
  const mezclar = (l) => {
    const m = l.map((x) => ({ ...x }));
    for (let j = m.length - 1; j > 0; j--) {
      const k = Math.floor(azar() * (j + 1));
      [m[j], m[k]] = [m[k], m[j]];
    }
    return m;
  };
  const firma = (r) => JSON.stringify(r.map((x) => [x.id, [...x.fuentes].sort(), x.sql, x.contenidoDistinto]).sort());
  const resultados = new Set();
  for (let i = 0; i < 120; i++) resultados.add(firma(reconciliar({ adjuntos: mezclar(adjuntos), repo: mezclar(repo) })));
  assert.equal(resultados.size, 1, [...resultados].join('\n'));
  const r = reconciliar({ adjuntos, repo });
  const uno = r.find((x) => String(x.id).endsWith('#1'));
  assert.ok(uno, r.map((x) => x.id).join(','));
  assert.deepEqual([...uno.fuentes].sort(), ['adjunto', 'repo']);
});

// Fixtures de la review: una task de scripts de la US 2 con el mismo sp_a.sql que la US 1.
const spA = (id, fuente, extra = {}) => s(id, fuente, { archivo: 'sp_a.sql', wiId: Number(id.split('/')[0]), vinculadoPor: 'contenedor', ...extra });
const repoSpA = [spA('1/sp_a', 'repo', { carpeta: 'US-1', hash: 'hA', sql: 'A' }), spA('2/sp_a', 'repo', { carpeta: 'US-2', hash: 'hB', sql: 'B' })];
const us1SpA = spA('1/sp_a', 'adjunto', { contenedorId: 1, contenedorTipo: 'User Story', contenedorTitulo: 'Uno', hash: 'hA', sql: 'A', creado: '2026-09-01' });
const taskUs2 = (sql, creado) => spA('25170/sp_a', 'adjunto', { contenedorId: 25170, contenedorTipo: 'Task', contenedorTitulo: 'US-2_Otra', hash: `h${sql}`, sql, creado });
const firmaSpA = (r) => r.map((x) => `${x.id} ${[...x.fuentes].sort()} ${x.sql} ${x.contenidoDistinto}`).sort();

test('la task de scripts de OTRA US no se une a esta aunque el archivo se llame igual', () => {
  const scripts = reconciliar({ adjuntos: [us1SpA, taskUs2('B', '2026-09-05')], repo: repoSpA });
  assert.deepEqual(firmaSpA(scripts), ['1/sp_a adjunto,repo A false', '2/sp_a adjunto,repo B false']);
  const codigos = detectarDesvios({ scripts, wis: [{ id: 1, estado: 'Active' }, { id: 2, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);
  assert.equal(codigos.includes('D12'), false, codigos.join(','));
  assert.equal(codigos.includes('D5'), false, codigos.join(','));
});

test('la task de la US 2 con dos subidas de sp_a queda igual que antes de unir US y task', () => {
  const scripts = reconciliar({ adjuntos: [us1SpA, taskUs2('A', '2026-09-02'), taskUs2('B', '2026-09-05')], repo: repoSpA });
  assert.deepEqual(firmaSpA(scripts), ['1/sp_a adjunto,repo A false', '2/sp_a adjunto,repo B true']);
});

test('una task cuyo titulo nombra DOS US no se une por titulo: queda igual que antes de unir', () => {
  const tk = spA('25170/sp_a', 'adjunto', { contenedorId: 25170, contenedorTipo: 'Task', contenedorTitulo: 'US-1 y US-2', hash: 'hB', sql: 'B', creado: '2026-09-05' });
  const scripts = reconciliar({ adjuntos: [us1SpA, tk], repo: repoSpA });
  assert.deepEqual(firmaSpA(scripts), ['1/sp_a adjunto,repo A false', '2/sp_a adjunto,repo B false']);
  const codigos = detectarDesvios({
    scripts, wis: [{ id: 1, estado: 'Resolved' }, { id: 2, estado: 'Resolved' }],
    tasks: [{ id: 25170, estado: 'Active', adjuntos: ['25170/sp_a'] }], estados: {},
  }).map((d) => d.codigo);
  assert.equal(codigos.includes('D12'), false, codigos.join(','));
  assert.equal(codigos.includes('D5'), false, codigos.join(','));
  assert.equal(codigos.filter((c) => c === 'D1').length, 1, codigos.join(','));
});

test('el titulo nombra la US solo como token propio: BUS- y HU- no cuentan', () => {
  for (const titulo of ['BUS-24768 x', 'HU-24768']) {
    const r = reconciliar({ adjuntos: [enUS(), enTask({ contenedorTitulo: titulo })] });
    assert.equal(r.length, 2, titulo);
  }
});

test('el titulo nombra la US con U-, US sin guion o en minusculas', () => {
  for (const titulo of ['U-24768 scripts', 'US24768', 'us-24768']) {
    const r = reconciliar({ adjuntos: [enUS(), enTask({ contenedorTitulo: titulo })] });
    assert.equal(r.length, 1, titulo);
  }
});

test('el padre manda aunque el titulo nombre dos US', () => {
  const r = reconciliar({ adjuntos: [enUS(), enTask({ contenedorTitulo: 'US-24768 y US-24999', contenedorPadre: 24768 })] });
  assert.equal(r.length, 1, r.map((x) => x.id).join(','));
});

// ---------------- __NEW: la copia commiteada del script adjunto ----------------
const ADJ_25017 = '[B-25017] - Descuento por proveedor en GetPriceWithDiscountAndDiscount - ALTER.sql';
const CARPETA_25017 = 'BUG-25017_Descuento_Por_Proveedor_En_Carrito_Pedidos_Web';
const spSql = (cuerpo = 'SELECT 1') => `ALTER PROCEDURE [dbo].[GetPriceWithDiscountAndDiscount] @a INT AS ${cuerpo}`;
const adj25017 = (sql = spSql(), extra = {}) => armarScriptParcial(ADJ_25017, sql, 'adjunto', {
  contenedorId: 30015, wiIdFallback: 30015, responsables: { subioElAdjunto: { nombre: 'Beto' } }, ...extra,
});
const new25017 = (sql = spSql(), extra = {}) => armarScriptParcial('GetPriceWithDiscountAndDiscount__NEW.sql', sql, 'repo', {
  carpeta: CARPETA_25017, wiIdFallback: 25017, esNew: true, nombreSp: 'GetPriceWithDiscountAndDiscount',
  responsables: { commiteoEnElRepo: { nombre: 'Ana' } }, ...extra,
});
const codigosDe = (scripts) => detectarDesvios({ scripts, wis: [{ id: 25017, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);

test('__NEW con el mismo contenido que el adjunto: UN registro con las dos fuentes, sin D5/D6/D12', () => {
  const r = reconciliar({ adjuntos: [adj25017()], repo: [new25017()] });
  assert.equal(r.length, 1, r.map((x) => x.id).join(','));
  const x = r[0];
  assert.deepEqual([...x.fuentes].sort(), ['adjunto', 'repo']);
  assert.equal(x.id, adj25017().id, 'el id es el del adjunto: es lo que se sube');
  assert.equal(x.archivo, ADJ_25017);
  assert.equal(x.wiId, 25017);
  assert.equal(x.ordenPorFuente.repo, null);
  assert.equal(x.versiones.length, 2);
  assert.ok(x.aliases.includes(new25017().id), JSON.stringify(x.aliases));
  assert.deepEqual(x.responsables, { subioElAdjunto: { nombre: 'Beto' }, commiteoEnElRepo: { nombre: 'Ana' } });
  assert.equal(x.contenidoDistinto, false);
  const codigos = codigosDe(r);
  for (const c of ['D5', 'D6', 'D12']) assert.equal(codigos.includes(c), false, codigos.join(','));
});

test('__NEW con otro cuerpo pero el mismo SP: se une por nombre de modulo y D12 lo reporta', () => {
  const r = reconciliar({ adjuntos: [adj25017()], repo: [new25017(spSql('SELECT 2'))] });
  assert.equal(r.length, 1, r.map((x) => x.id).join(','));
  assert.equal(r[0].contenidoDistinto, true);
  assert.equal(r[0].sql, spSql(), 'se mide el adjunto');
  const codigos = codigosDe(r);
  assert.ok(codigos.includes('D12'), codigos.join(','));
  for (const c of ['D5', 'D6']) assert.equal(codigos.includes(c), false, codigos.join(','));
});

test('__NEW con el mismo hash se une aunque el adjunto no defina un modulo con ese nombre', () => {
  const sql = 'ALTER TABLE dbo.T ADD c INT NULL';
  const r = reconciliar({ adjuntos: [adj25017(sql)], repo: [new25017(sql)] });
  assert.equal(r.length, 1, r.map((x) => x.id).join(','));
});

test('__NEW con dos adjuntos candidatos del mismo work item: no se elige, queda D5', () => {
  const otro = armarScriptParcial('[B-25017] - 02 - Otra vuelta al descuento - ALTER.sql', spSql('SELECT 3'), 'adjunto', { contenedorId: 30015 });
  const r = reconciliar({ adjuntos: [adj25017(), otro], repo: [new25017(spSql('SELECT 9'))] });
  assert.equal(r.length, 3, r.map((x) => x.id).join(','));
  const codigos = codigosDe(r);
  assert.equal(codigos.filter((c) => c === 'D5').length, 1, codigos.join(','));
});

test('__NEW de otro work item no se une aunque defina el mismo SP', () => {
  const r = reconciliar({ adjuntos: [adj25017()], repo: [new25017(spSql(), { carpeta: 'BUG-99999_X', wiIdFallback: 99999 })] });
  assert.equal(r.length, 2, r.map((x) => x.id).join(','));
});

test('__NEW: el resultado no depende del orden de llegada (20 barajados)', () => {
  let semilla = 25017;
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
  const fixture = () => ({
    adjuntos: [
      adj25017(),
      armarScriptParcial('[B-25017] - 02 - Tabla nueva - CREATE.sql', 'CREATE TABLE dbo.X (a INT)', 'adjunto', { contenedorId: 30015 }),
      armarScriptParcial('[U-7] - Otro SP - ALTER.sql', 'ALTER PROCEDURE dbo.sp_b AS SELECT 1', 'adjunto', { contenedorId: 30016 }),
    ],
    repo: [
      new25017(spSql('SELECT 2')),
      armarScriptParcial('sp_b__NEW.sql', 'ALTER PROCEDURE dbo.sp_b AS SELECT 1', 'repo', { carpeta: 'US-7', wiIdFallback: 7, esNew: true, nombreSp: 'sp_b' }),
    ],
  });
  const huella = (scripts) => scripts.map((x) => `${x.id}|${[...x.fuentes].sort()}|${x.sql}|${x.contenidoDistinto}|${(x.aliases || []).join(';')}`).sort();
  const esperado = huella(reconciliar(fixture()));
  assert.equal(esperado.length, 3, esperado.join('\n'));
  for (let i = 0; i < 20; i++) {
    const { repo, adjuntos } = fixture();
    assert.deepEqual(huella(reconciliar({ repo: barajar(repo), adjuntos: barajar(adjuntos) })), esperado, `iteracion ${i}`);
  }
});

// El __NEW no le roba el adjunto a su pareja exacta del repo: 01 de la tarjeta con 01 del repo
// (re-clavado #1 por la colision con el 02). El __NEW corre al final, sobre lo que quedo solo.
const procFoo = (cuerpo) => `ALTER PROCEDURE dbo.Foo AS ${cuerpo}`;
const robo = () => ({
  adjuntos: [armarScriptParcial('[U-5] - 01 - Foo - ALTER.sql', procFoo('SELECT 1'), 'adjunto', { contenedorId: 900 })],
  repo: [
    armarScriptParcial('[U-5] - 01 - Foo - ALTER.sql', procFoo('SELECT 1'), 'repo', { carpeta: 'US-5' }),
    armarScriptParcial('[U-5] - 02 - Foo - ALTER.sql', procFoo('SELECT 2'), 'repo', { carpeta: 'US-5' }),
    armarScriptParcial('Foo__NEW.sql', procFoo('SELECT 2'), 'repo', { carpeta: 'US-5', wiIdFallback: 5, esNew: true, nombreSp: 'Foo' }),
  ],
});

test('__NEW no le roba el adjunto a su pareja exacta del repo: sin D12 y el #1 con las dos fuentes', () => {
  const r = reconciliar(robo());
  const uno = r.find((x) => x.orden === 1);
  assert.deepEqual([...uno.fuentes].sort(), ['adjunto', 'repo'], r.map((x) => `${x.id}:${x.fuentes}`).join(' | '));
  assert.equal(uno.contenidoDistinto, false);
  const codigos = detectarDesvios({ scripts: r, wis: [{ id: 5, estado: 'Active' }], tasks: [], estados: {} }).map((d) => d.codigo);
  assert.equal(codigos.includes('D12'), false, codigos.join(','));
  assert.equal(codigos.includes('D6'), false, codigos.join(','));
});

test('__NEW que compite con una pareja exacta: 20 barajados dan el mismo resultado', () => {
  let semilla = 5468;
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
  const huella = (scripts) => scripts.map((x) => `${x.id}|${[...x.fuentes].sort()}|${x.sql}|${x.contenidoDistinto}`).sort();
  const esperado = huella(reconciliar(robo()));
  for (let i = 0; i < 20; i++) {
    const { repo, adjuntos } = robo();
    assert.deepEqual(huella(reconciliar({ repo: barajar(repo), adjuntos: barajar(adjuntos) })), esperado, `iteracion ${i}`);
  }
});
