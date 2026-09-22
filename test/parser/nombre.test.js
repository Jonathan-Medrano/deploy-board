import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearNombre } from '../../src/parser/nombre.js';

test('nombre canonico completo', () => {
  const r = parsearNombre('[U-25051] - PRE - 01 - Columna ActualizarCategoriaTiendaNube en Integracion - ALTER.sql');
  assert.equal(r.wiTipo, 'U');
  assert.equal(r.wiId, 25051);
  assert.equal(r.esPre, true);
  assert.equal(r.orden, 1);
  assert.equal(r.accion, 'ALTER');
  assert.equal(r.descripcion, 'Columna ActualizarCategoriaTiendaNube en Integracion');
});

test('sin PRE y sin orden', () => {
  const r = parsearNombre('[B-25017] - Descuento por proveedor en GetPriceWithDiscountAndDiscount - ALTER.sql');
  assert.equal(r.wiTipo, 'B');
  assert.equal(r.wiId, 25017);
  assert.equal(r.esPre, false);
  assert.equal(r.orden, null);
  assert.equal(r.accion, 'ALTER');
});

test('corchete sin letra de tipo', () => {
  const r = parsearNombre('[20311] - StockPorDepositos - PRESUBIDA.sql');
  assert.equal(r.wiId, 20311);
  assert.equal(r.wiTipo, null);
});

test('XXXXX no vincula a ningun work item: dispara D7', () => {
  const r = parsearNombre('[XXXXX] - Indice de busqueda de pedidos - CREATE.sql');
  assert.equal(r.wiId, null);
});

test('nombre fuera de convencion no inventa un id', () => {
  const r = parsearNombre('sp_getselectproducts__OLD.sql');
  assert.equal(r.wiId, null);
  assert.equal(r.accion, null);
});
