import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { veredicto } from '../../src/sondas/veredicto.js';
import { normalizarDefinicion } from '../../src/parser/normalizar.js';

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

test('sin sondas es ?, NUNCA OK: nada que evaluar no es todo en verde', () => {
  const v = veredicto([], {});
  assert.equal(v.estado, '?');
  assert.match(v.nota, /sin sondas/);
});

test('todas en verde es OK', () => {
  const s = [{ id: 's0', tipo: 'columna' }, { id: 's1', tipo: 'tabla' }];
  assert.equal(veredicto(s, { s0: 'SI', s1: 'SI' }).estado, 'OK');
});

test('todas en rojo es FALTA', () => {
  const s = [{ id: 's0', tipo: 'columna' }];
  assert.equal(veredicto(s, { s0: 'NO' }).estado, 'FALTA');
});

test('mezcla es PARCIAL, y dice cuantas', () => {
  const s = [{ id: 's0', tipo: 'columna' }, { id: 's1', tipo: 'tabla' }];
  const v = veredicto(s, { s0: 'SI', s1: 'NO' });
  assert.equal(v.estado, 'PARCIAL');
  assert.match(v.nota, /1\/2/);
});

test('sin_sonda es ? y arrastra el motivo', () => {
  const v = veredicto([{ id: 's0', tipo: 'sin_sonda', detalle: 'no pude derivar sonda de raro.sql' }], {});
  assert.equal(v.estado, '?');
  assert.match(v.nota, /raro\.sql/);
});

test('una sonda que no volvio es ?, nunca OK', () => {
  const v = veredicto([{ id: 's0', tipo: 'columna' }], {});
  assert.equal(v.estado, '?');
});

test('el procedure EXISTE pero con otra definicion: NO es OK', () => {
  const esperado = md5(normalizarDefinicion('CREATE PROCEDURE dbo.sp_x AS SELECT 1'));
  const s = [{ id: 's0', tipo: 'modulo', objeto: 'sp_x', esperado }];
  const v = veredicto(s, { s0: 'SI' }, { sp_x: 'ALTER PROCEDURE dbo.sp_x AS SELECT 2' });
  assert.equal(v.estado, 'FALTA');
});

test('el procedure existe y la definicion coincide: OK', () => {
  const esperado = 'd41d8cd98f00b204e9800998ecf8427e';
  const s = [{ id: 's0', tipo: 'modulo', objeto: 'sp_x', esperado }];
  const v = veredicto(s, { s0: 'SI' }, { sp_x: '' });
  assert.equal(v.estado, 'OK');
});
