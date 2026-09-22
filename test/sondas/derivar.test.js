import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerObjetos } from '../../src/parser/objetos.js';
import { derivarSondas } from '../../src/sondas/derivar.js';

test('un modulo da una sonda que compara la definicion viva', () => {
  const sql = 'CREATE PROCEDURE dbo.sp_x AS SELECT 1;';
  const s = derivarSondas(extraerObjetos(sql), sql, 'x.sql');
  assert.equal(s.length, 1);
  assert.equal(s[0].tipo, 'modulo');
  assert.equal(s[0].objeto, 'sp_x');
  assert.equal(typeof s[0].esperado, 'string');
});

test('sin objetos derivables la sonda es sin_sonda, con motivo', () => {
  const s = derivarSondas([], 'EXEC sp_updatestats;', 'raro.sql');
  assert.equal(s.length, 1);
  assert.equal(s[0].tipo, 'sin_sonda');
  assert.match(s[0].detalle, /raro\.sql/);
});

test('cada sonda tiene id estable y unico', () => {
  const sql = 'ALTER TABLE dbo.P ADD a BIT; ALTER TABLE dbo.P ADD b BIT;';
  const s = derivarSondas(extraerObjetos(sql), sql, 'x.sql');
  assert.equal(new Set(s.map((x) => x.id)).size, s.length);
});
