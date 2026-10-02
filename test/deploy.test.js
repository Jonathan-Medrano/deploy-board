import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelDeploy, esTarjetaDeScripts } from '../src/deploy.js';

const wi = (o) => ({ id: 1, titulo: 't', estado: 'Active', ...o });

test('la tarjeta Scripts abierta: el deploy no esta hecho', () => {
  const r = estadoDelDeploy([wi({ id: 25033, titulo: 'Scripts', estado: 'New' }), wi({ id: 2 })]);
  assert.equal(r.hecho, false);
  assert.deepEqual(r.tarjetas, [{ id: 25033, estado: 'New' }]);
  assert.equal(r.nota, null);
});

test('la tarjeta Scripts cerrada o Done: el deploy esta hecho', () => {
  for (const estado of ['Closed', 'Done', 'closed']) {
    assert.equal(estadoDelDeploy([wi({ titulo: 'Scripts', estado })]).hecho, true, estado);
  }
});

test('el titulo se reconoce en mayusculas y con espacios, como la escribe el equipo', () => {
  assert.equal(esTarjetaDeScripts(wi({ titulo: ' SCRIPTS ' })), true);
  assert.equal(esTarjetaDeScripts(wi({ titulo: 'Crear scripts de migracion' })), false);
});

test('una tarjeta Scripts de otro sprint no cuenta', () => {
  const r = estadoDelDeploy([wi({ titulo: 'Scripts', estado: 'Closed', fueraDelSprint: true })]);
  assert.equal(r.hecho, false);
  assert.equal(r.tarjetas.length, 0);
});

test('sin tarjeta Scripts no se da por ejecutado lo que esta en main, y se dice por que', () => {
  const r = estadoDelDeploy([wi({})]);
  assert.equal(r.hecho, false);
  assert.match(r.nota, /no encontre la tarjeta/i);
});

test('con dos tarjetas Scripts, esta hecho solo si estan las dos cerradas', () => {
  const r = estadoDelDeploy([wi({ id: 1, titulo: 'Scripts', estado: 'Closed' }), wi({ id: 2, titulo: 'Scripts', estado: 'New' })]);
  assert.equal(r.hecho, false);
});
