import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rango, validarEscalera } from '../../src/desvios/escalera.js';

test('Tested esta por encima de In Test', () => {
  assert.ok(rango('Tested') > rango('In Test'));
});

test('In Test con Bug NO avanza: comparte rango con In Test', () => {
  assert.equal(rango('In Test con Bug'), rango('In Test'));
});

test('Removed sale de todo calculo', () => {
  assert.equal(rango('Removed'), -1);
});

test('un estado desconocido da null, no un numero inventado', () => {
  assert.equal(rango('Esperando Deploy'), null);
});

test('el rango no depende de mayusculas ni de espacios de mas', () => {
  assert.equal(rango('  tested '), rango('Tested'));
});

test('validarEscalera devuelve los estados que la tabla no conoce', () => {
  assert.deepEqual(validarEscalera(['New', 'Tested', 'Esperando Deploy']), ['Esperando Deploy']);
});

// Los 10 estados salieron de la lista REAL de ADO el 2026-09-22, no de la memoria: la semilla
// anterior tenia 9 y le faltaban `Testing` y `Paused`, asi que una tarjeta en `Testing` no
// disparaba D1 ni D4 — se callaba en vez de inventar, que es correcto, pero era un agujero.
test('Testing va ENTRE In Test y Tested: el tester la esta trabajando, no la termino', () => {
  assert.ok(rango('Testing') > rango('In Test'));
  assert.ok(rango('Testing') < rango('Tested'));
});

test('Paused comparte rango con Active: trabajo frizado no es trabajo que avanzo', () => {
  assert.equal(rango('Paused'), rango('Active'));
});

test('la escalera cubre los 10 estados reales del proceso', () => {
  const reales = ['New', 'Active', 'Resolved', 'Paused', 'In Test', 'In Test con Bug', 'Testing', 'Tested', 'Closed', 'Removed'];
  assert.deepEqual(validarEscalera(reales), [], 'un estado del proceso sin rango deja D1 y D4 mudos para esas tarjetas');
});

test('una clave heredada de Object.prototype es desconocida, no un rango', () => {
  for (const heredada of ['constructor', 'valueOf', 'hasOwnProperty', '__proto__', 'toString']) {
    assert.equal(rango(heredada), null, `${heredada} devolvio algo que no es null`);
  }
  assert.deepEqual(validarEscalera(['constructor']), ['constructor']);
});
