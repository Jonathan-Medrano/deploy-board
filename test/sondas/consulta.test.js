import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultaDeSondas, consultaDefinicion } from '../../src/sondas/consulta.js';

const ESCRITURA = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|MERGE)\b/i;

// La garantia de solo-lectura se prueba sobre LOS SEIS tipos, no sobre dos. Un chequeo que
// alimenta la mitad de las ramas pasa porque sus inputs no producen esas palabras, no
// porque la garantia se sostenga — y deja las otras cuatro sin red para siempre.
test('ningun tipo de sonda emite una sentencia de escritura', () => {
  const todas = [
    { id: 's0', tipo: 'columna', tabla: 'Producto', columna: 'UtilizaPartidas' },
    { id: 's1', tipo: 'tabla', tabla: 'Nota' },
    { id: 's2', tipo: 'columna_max', tabla: 'Nota', columna: 'Texto' },
    { id: 's3', tipo: 'fila', tabla: 'Permiso', columna: 'Name', valor: "'VerPedidos'" },
    { id: 's4', tipo: 'indice', indice: 'IX_Pedido_Fecha', tabla: 'Pedido' },
    { id: 's5', tipo: 'modulo', objeto: 'sp_x', esperado: 'abc' },
  ];
  for (const s of todas) {
    const sql = consultaDeSondas([s]);
    assert.ok(sql, `${s.tipo} no genero consulta`);
    assert.match(sql, /SELECT/);
    assert.equal(ESCRITURA.test(sql), false, `${s.tipo} emitio una sentencia de escritura`);
  }
});

test('rechaza un nombre de tabla que no es un identificador simple', () => {
  assert.throws(
    () => consultaDeSondas([{ id: 's0', tipo: 'fila', tabla: 'T] WHERE 1=1; DROP TABLE Usuario --', columna: 'Name', valor: "'x'" }]),
    /identificador SQL simple/
  );
});

test('rechaza un valor testigo que no es un literal SQL', () => {
  assert.throws(
    () => consultaDeSondas([{ id: 's0', tipo: 'fila', tabla: 'T', columna: 'Name', valor: '1; DROP TABLE Usuario' }]),
    /literal SQL/
  );
});

test('consultaDefinicion solo lee sys.sql_modules', () => {
  const sql = consultaDefinicion('sp_x');
  assert.match(sql, /sys\.sql_modules/);
  assert.equal(ESCRITURA.test(sql), false);
});

test('escapa la comilla simple para que un valor no rompa la consulta', () => {
  const q = consultaDeSondas([{ id: 's0', tipo: 'fila', tabla: "T", columna: 'Name', valor: "'O''Brien'" }]);
  assert.match(q, /O''Brien/);
});

test('una lista sin sondas consultables devuelve null', () => {
  assert.equal(consultaDeSondas([{ id: 's0', tipo: 'sin_sonda', detalle: 'x' }]), null);
});
