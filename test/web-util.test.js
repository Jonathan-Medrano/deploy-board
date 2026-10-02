import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function cargar() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../web/util.js', import.meta.url), 'utf8'), ctx);
  return ctx;
}

test('esc neutraliza un nombre de archivo que intenta salir de un atributo', () => {
  const { esc } = cargar();
  const html = '<button data-id="' + esc('[U-1] - x" onmouseover="alert(1) - ALTER.sql') + '">';
  assert.equal(html.includes('" onmouseover="'), false);
  assert.match(html, /&quot; onmouseover=&quot;/);
});

test('esc escapa comilla simple, menor, mayor y ampersand', () => {
  const { esc } = cargar();
  assert.equal(esc(`<a href='x'>&</a>`), '&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;');
});

test('esc de null o undefined es la cadena vacia, no "null"', () => {
  const { esc } = cargar();
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('hoy en Argentina: 2026-09-29T01:00:00Z es 22:00 del 28 en Buenos Aires', () => {
  const { hoy } = cargar();
  assert.equal(hoy(new Date('2026-09-29T01:00:00Z')), '2026-09-28');
});

test('hoy en Argentina: 2026-09-28T12:00:00Z es mediodía del 28 en Buenos Aires', () => {
  const { hoy } = cargar();
  assert.equal(hoy(new Date('2026-09-28T12:00:00Z')), '2026-09-28');
});

test('temaEfectivo respeta la eleccion guardada por sobre el sistema', () => {
  const { temaEfectivo } = cargar();
  assert.equal(temaEfectivo('light', true), 'light');
  assert.equal(temaEfectivo('dark', false), 'dark');
});

test('temaEfectivo sin eleccion guardada sigue al sistema', () => {
  const { temaEfectivo } = cargar();
  assert.equal(temaEfectivo(null, true), 'dark');
  assert.equal(temaEfectivo(null, false), 'light');
});

test('temaEfectivo ignora un valor guardado que no es un tema', () => {
  const { temaEfectivo } = cargar();
  assert.equal(temaEfectivo('azul', true), 'dark');
  assert.equal(temaEfectivo('', false), 'light');
});

test('temaAlternado pasa al otro tema', () => {
  const { temaAlternado } = cargar();
  assert.equal(temaAlternado('dark'), 'light');
  assert.equal(temaAlternado('light'), 'dark');
});

const plano = (x) => JSON.parse(JSON.stringify(x));
const MEDIDO = {
  par: 'stage-main',
  repos: [
    { repo: 'A', pendientes: 3, prActivo: null, error: null },
    { repo: 'B', pendientes: 0, prActivo: null, error: null },
    { repo: 'C', pendientes: 2, prActivo: { id: 9 }, error: null },
    { repo: 'D', pendientes: 0, prActivo: null, error: '403' },
    { repo: 'E', pendientes: 1, prActivo: null, error: null },
  ],
};

test('crear todos toma solo los repos con cambios, sin PR activo y sin error', () => {
  const { reposParaCrear } = cargar();
  assert.deepEqual(plano(reposParaCrear(MEDIDO, 'stage-main')), ['A', 'E']);
});

test('crear todos no ofrece nada si la tabla es de otro pase o no se midio', () => {
  const { reposParaCrear } = cargar();
  assert.deepEqual(plano(reposParaCrear(MEDIDO, 'dev-stage')), []);
  assert.deepEqual(plano(reposParaCrear(null, 'stage-main')), []);
});

test('crear en serie: de a uno, en orden, y un fallo no frena a los demas', async () => {
  const { crearEnSerie } = cargar();
  const orden = [];
  let enVuelo = 0, maximo = 0;
  const crearUno = async (repo) => {
    enVuelo++; maximo = Math.max(maximo, enVuelo); orden.push(repo);
    await new Promise((r) => setTimeout(r, 2));
    enVuelo--;
    if (repo === 'B') throw new Error('Azure 400: policy');
    return { id: repo.charCodeAt(0), link: 'L' + repo };
  };
  const vistos = [];
  const res = await crearEnSerie(['A', 'B', 'C'], crearUno, (r) => vistos.push(r.repo));
  assert.deepEqual(orden, ['A', 'B', 'C']);
  assert.equal(maximo, 1);
  assert.deepEqual(vistos, ['A', 'B', 'C']);
  assert.deepEqual(plano(res), [
    { repo: 'A', ok: true, id: 65, link: 'LA' },
    { repo: 'B', ok: false, error: 'Azure 400: policy', link: null },
    { repo: 'C', ok: true, id: 67, link: 'LC' },
  ]);
});

test('crear en serie: un 409 con link del PR existente se informa con ese link', async () => {
  const { crearEnSerie } = cargar();
  const crearUno = async () => { const e = new Error('Ya hay un PR activo'); e.body = { link: 'L9' }; throw e; };
  const res = await crearEnSerie(['A'], crearUno, () => {});
  assert.deepEqual(plano(res), [{ repo: 'A', ok: false, error: 'Ya hay un PR activo', link: 'L9' }]);
});
