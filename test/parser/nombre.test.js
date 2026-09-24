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

test('PRE despues del NN (US-24994): mismo resultado que PRE antes', () => {
  const antes = parsearNombre('[U-24994] - PRE - 01 - Tabla LogRateLimit con indices - CREATE.sql');
  const despues = parsearNombre('[U-24994] - 01 - PRE - Tabla LogRateLimit con indices - CREATE.sql');
  assert.equal(despues.esPre, true);
  assert.equal(despues.orden, 1);
  assert.equal(despues.descripcion, 'Tabla LogRateLimit con indices');
  assert.equal(despues.accion, 'CREATE');
  assert.equal(despues.esPre, antes.esPre);
  assert.equal(despues.orden, antes.orden);
  assert.equal(despues.descripcion, antes.descripcion);
  assert.equal(despues.accion, antes.accion);
});

test('sin PRE en ninguna posicion', () => {
  const r = parsearNombre('[U-1] - 01 - Desc - ALTER.sql');
  assert.equal(r.esPre, false);
  assert.equal(r.orden, 1);
});

test('"pre" adentro de la descripcion no es PRE', () => {
  const r = parsearNombre('[U-1] - 01 - Precio de lista - ALTER.sql');
  assert.equal(r.esPre, false);
  assert.equal(r.descripcion, 'Precio de lista');
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
