import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTADO_VACIO, aplicarCambio, normalizar } from '../src/marcas.js';

test('marcar un script como subido a main lo deja con quien y cuando', () => {
  const r = aplicarCambio(ESTADO_VACIO, { tipo: 'marca', id: 'a', poner: true, quien: 'Ana', fecha: '2026-09-22' });
  assert.deepEqual(r.marcas.a, { subidoAMain: true, fecha: '2026-09-22', por: 'Ana' });
});

test('desmarcar borra la entrada en vez de dejar un false que despues nadie sabe leer', () => {
  const con = aplicarCambio(ESTADO_VACIO, { tipo: 'marca', id: 'a', poner: true, quien: 'Ana', fecha: '2026-09-22' });
  const sin = aplicarCambio(con, { tipo: 'marca', id: 'a', poner: false });
  assert.equal(Object.hasOwn(sin.marcas, 'a'), false);
});

test('marcas e ignorados son listas distintas: una decision no arrastra a la otra', () => {
  let r = aplicarCambio(ESTADO_VACIO, { tipo: 'marca', id: 'a', poner: true, quien: 'A', fecha: 'f' });
  r = aplicarCambio(r, { tipo: 'ignorado', id: 'a', poner: true, quien: 'B', fecha: 'f', motivo: 'no va' });
  assert.equal(r.marcas.a.subidoAMain, true);
  assert.equal(r.ignorados.a.motivo, 'no va');
});

test('un ignorado guarda el motivo porque sin motivo nadie puede revisar la decision despues', () => {
  const r = aplicarCambio(ESTADO_VACIO, { tipo: 'ignorado', id: 'a', poner: true, quien: 'B', fecha: 'f' });
  assert.equal(r.ignorados.a.motivo, '');
});

test('aplicar un cambio no muta el estado anterior', () => {
  const antes = ESTADO_VACIO;
  aplicarCambio(antes, { tipo: 'marca', id: 'a', poner: true, quien: 'A', fecha: 'f' });
  assert.deepEqual(antes.marcas, {});
});

test('un tipo que no existe se rechaza en vez de escribir una lista fantasma', () => {
  assert.throws(() => aplicarCambio(ESTADO_VACIO, { tipo: 'otra', id: 'a', poner: true }), /tipo/i);
});

test('un id vacio se rechaza: una clave vacia pisa silenciosamente a la siguiente', () => {
  assert.throws(() => aplicarCambio(ESTADO_VACIO, { tipo: 'marca', id: '', poner: true }), /id/i);
});

test('normalizar tolera un archivo a medio escribir sin perder lo que si es legible', () => {
  const r = normalizar({ marcas: { a: { subidoAMain: true } }, basura: 1 });
  assert.deepEqual(r, { marcas: { a: { subidoAMain: true } }, ignorados: {} });
});

test('normalizar de null devuelve el estado vacio y no explota', () => {
  assert.deepEqual(normalizar(null), { marcas: {}, ignorados: {} });
});
