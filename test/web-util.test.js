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
