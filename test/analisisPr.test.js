import test from 'node:test';
import assert from 'node:assert/strict';
import { leerLinkDePr, compararPrConPanel, analizarPr } from '../src/analisisPr.js';

const SPRINT = 'Sprint_2026_10_01';

const delPanel = (archivo, extra = {}) => ({
  id: `p/${archivo}`, archivo, wiId: 25100, hash: `h-${archivo}`, objetos: [],
  fuentes: ['adjunto', 'repo'], carpeta: 'US-25100_algo',
  responsables: { subioElAdjunto: { nombre: 'Ana' }, commiteoEnElRepo: { nombre: 'Beto' } },
  ...extra,
});

const delPr = (archivo, extra = {}) => ({
  archivo, wiId: 25100, hash: `h-${archivo}`, objetos: [],
  ruta: `${SPRINT}/US-25100_algo/${archivo}`, sprint: SPRINT,
  responsables: { commiteoEnElRepo: { nombre: 'Caro' } },
  ...extra,
});

const WIS = [{ id: 25100, asignadoA: 'Dani', estado: 'Active' }];

test('el link de ADO da repo e id; un numero suelto da solo el id', () => {
  assert.deepEqual(leerLinkDePr('https://dev.azure.com/agenciap/Fidel/_git/Api.Net/pullrequest/25801'), { repo: 'Api.Net', id: 25801 });
  assert.deepEqual(leerLinkDePr('https://agenciap.visualstudio.com/Fidel/_git/Api.Net/pullrequest/25801?_a=files'), { repo: 'Api.Net', id: 25801 });
  assert.deepEqual(leerLinkDePr(' 25801 '), { repo: null, id: 25801 });
  assert.equal(leerLinkDePr('https://dev.azure.com/agenciap/Fidel/_workitems/edit/25801'), null);
  assert.equal(leerLinkDePr(''), null);
});

test('si el PR trae exactamente lo que mide el panel, no hay hallazgos', () => {
  const a = 'x - 01 - uno - ALTER.sql';
  assert.deepEqual(compararPrConPanel({ scriptsPr: [delPr(a)], scriptsPanel: [delPanel(a)], wis: WIS, sprint: SPRINT }), []);
});

test('mismo contenido con otro nombre cuenta como el mismo script', () => {
  const pr = delPr('otro nombre.sql', { hash: 'h-igual' });
  const panel = delPanel('x - 01 - uno - ALTER.sql', { hash: 'h-igual' });
  assert.deepEqual(compararPrConPanel({ scriptsPr: [pr], scriptsPanel: [panel], wis: WIS, sprint: SPRINT }), []);
});

test('un script del PR en la carpeta de otro sprint: el panel no lo vio y lo dice con quien lo commiteo', () => {
  const pr = delPr('[U-25100] - 02 - perdido - ALTER.sql', { sprint: 'Sprint_2026_09_02', ruta: 'Sprint_2026_09_02/US-25100_algo/[U-25100] - 02 - perdido - ALTER.sql' });
  const [h] = compararPrConPanel({ scriptsPr: [pr], scriptsPanel: [], wis: WIS, sprint: SPRINT });
  assert.equal(h.tipo, 'otro-sprint');
  assert.equal(h.donde, 'Sprint_2026_09_02/US-25100_algo/[U-25100] - 02 - perdido - ALTER.sql');
  assert.match(h.porque, /Sprint_2026_09_02/);
  assert.match(h.porque, /Sprint_2026_10_01/);
  assert.equal(h.responsable, 'Caro');
});

test('un script del PR en la carpeta del sprint que el panel no vio: esta en master y no en dev', () => {
  const [h] = compararPrConPanel({ scriptsPr: [delPr('nuevo.sql')], scriptsPanel: [], wis: WIS, sprint: SPRINT });
  assert.equal(h.tipo, 'fuera-del-panel');
  assert.match(h.porque, /dev/);
  assert.equal(h.responsable, 'Caro');
});

test('mismo nombre con otro contenido: dos versiones, responde quien lo commiteo en el PR', () => {
  const a = 'x - 01 - uno - ALTER.sql';
  const [h] = compararPrConPanel({ scriptsPr: [delPr(a, { hash: 'h-pr' })], scriptsPanel: [delPanel(a, { hash: 'h-panel' })], wis: WIS, sprint: SPRINT });
  assert.equal(h.tipo, 'contenido-distinto');
  assert.equal(h.responsable, 'Caro');
});

test('un __NEW del PR es el mismo script que el adjunto que define ese SP', () => {
  const panel = delPanel('[U-25100] - 03 - sp - ALTER.sql', { hash: 'h-a', objetos: [{ tipo: 'PROCEDURE', nombre: 'SP_Algo' }] });
  const pr = delPr('SP_Algo__NEW.sql', { hash: 'h-a' });
  assert.deepEqual(compararPrConPanel({ scriptsPr: [pr], scriptsPanel: [panel], wis: WIS, sprint: SPRINT }), []);
});

test('commiteado en dev y no en el PR: no llego a master, responde quien lo commiteo', () => {
  const [h] = compararPrConPanel({ scriptsPr: [], scriptsPanel: [delPanel('a.sql')], wis: WIS, sprint: SPRINT });
  assert.equal(h.tipo, 'no-en-pr');
  assert.match(h.porque, /master/);
  assert.equal(h.responsable, 'Beto');
});

test('commiteado sin autor conocido: responde el dueno del work item', () => {
  const panel = delPanel('a.sql', { responsables: {} });
  const [h] = compararPrConPanel({ scriptsPr: [], scriptsPanel: [panel], wis: WIS, sprint: SPRINT });
  assert.equal(h.responsable, 'Dani');
});

test('solo adjunto en la tarjeta: nunca se commiteo, responde quien lo subio', () => {
  const panel = delPanel('a.sql', { fuentes: ['adjunto'], carpeta: undefined });
  const [h] = compararPrConPanel({ scriptsPr: [], scriptsPanel: [panel], wis: WIS, sprint: SPRINT });
  assert.equal(h.tipo, 'sin-commit');
  assert.equal(h.responsable, 'Ana');
  assert.match(h.donde, /25100/);
});

test('ni los cerrados o pausados ni lo que ya esta en main se reclaman al PR', () => {
  const cerrado = delPanel('c.sql', { wiId: 1 });
  const pausado = delPanel('p.sql', { wiId: 2 });
  const enMain = delPanel('m.sql');
  const wis = [...WIS, { id: 1, estado: 'Closed' }, { id: 2, estado: 'Paused' }];
  const r = compararPrConPanel({ scriptsPr: [], scriptsPanel: [cerrado, pausado, enMain], wis, enMain: { [enMain.id]: 'igual' }, sprint: SPRINT });
  assert.deepEqual(r, []);
});

test('un script del PR de un work item cerrado que el panel conoce no sale como desconocido', () => {
  const a = 'c.sql';
  const r = compararPrConPanel({ scriptsPr: [delPr(a, { wiId: 1 })], scriptsPanel: [delPanel(a, { wiId: 1 })], wis: [{ id: 1, estado: 'Closed' }], sprint: SPRINT });
  assert.deepEqual(r, []);
});

test('lo mas grave primero: lo que el panel no vio va antes que lo que falta en el PR', () => {
  const r = compararPrConPanel({
    scriptsPr: [delPr('perdido.sql', { sprint: 'Sprint_viejo' })],
    scriptsPanel: [delPanel('a.sql', { fuentes: ['adjunto'] }), delPanel('b.sql')],
    wis: WIS, sprint: SPRINT,
  });
  assert.deepEqual(r.map((h) => h.tipo), ['otro-sprint', 'no-en-pr', 'sin-commit']);
});

function adoFalso({ pr = {}, cambios = [] } = {}) {
  const llamadas = { diff: [], descargas: [] };
  return {
    llamadas,
    obtenerPr: async (repo, id) => ({
      id, titulo: 'StageToMain', estado: 'active', repo: 'Api.Net',
      origen: 'master', destino: 'main', commitOrigen: 'c-src', commitDestino: 'c-dst', ...pr,
    }),
    diffEntreCommits: async (repo, base, target) => { llamadas.diff.push({ base, target }); return cambios; },
    descargarArchivo: async (repo, ruta, version, tipo) => { llamadas.descargas.push({ ruta, version, tipo }); return Buffer.from('ALTER TABLE [dbo].[X] ADD [Y] INT NULL', 'utf8'); },
    ultimoCommitDe: async () => ({ nombre: 'Caro' }),
  };
}

const CARPETA = '/Api/DB_Migrations';

test('analizarPr diffea los commits del merge y lee cada .sql en el commit de origen', async () => {
  const ruta = `${CARPETA}/Sprint_2026_09_02/US-25100_algo/[U-25100] - 01 - x - ALTER.sql`;
  const ado = adoFalso({ cambios: [{ changeType: 'add', item: { path: ruta } }] });
  const r = await analizarPr(ado, { prUrl: 'https://dev.azure.com/agenciap/Fidel/_git/Api.Net/pullrequest/7', repo: 'Api.Net', carpeta: CARPETA, sprint: SPRINT, scripts: [], wis: WIS });
  assert.deepEqual(ado.llamadas.diff, [{ base: 'c-dst', target: 'c-src' }]);
  assert.deepEqual(ado.llamadas.descargas, [{ ruta, version: 'c-src', tipo: 'commit' }]);
  assert.equal(r.pr.id, 7);
  assert.equal(r.scripts, 1);
  assert.equal(r.hallazgos[0].tipo, 'otro-sprint');
  assert.deepEqual(r.avisos, []);
});

test('un PR que no es master -> main se analiza igual, con aviso', async () => {
  const r = await analizarPr(adoFalso({ pr: { origen: 'dev', destino: 'master' } }), { prUrl: '7', repo: 'Api.Net', carpeta: CARPETA, sprint: SPRINT, scripts: [], wis: [] });
  assert.match(r.avisos[0], /dev.*master/);
});

test('un link que no es de PR, o de otro repo, se rechaza antes de llamar a Azure', async () => {
  const ado = adoFalso();
  await assert.rejects(() => analizarPr(ado, { prUrl: 'cualquier cosa', repo: 'Api.Net', carpeta: CARPETA, scripts: [], wis: [] }), /link/);
  await assert.rejects(() => analizarPr(ado, { prUrl: 'https://dev.azure.com/agenciap/Fidel/_git/FidelFrontWeb/pullrequest/7', repo: 'Api.Net', carpeta: CARPETA, scripts: [], wis: [] }), /FidelFrontWeb/);
  assert.equal(ado.llamadas.diff.length, 0);
});
