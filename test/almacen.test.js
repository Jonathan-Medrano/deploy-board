import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearAlmacen, rutasDeEstado } from '../src/almacen.js';

function carpetaTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-board-'));
}

test('sin configurar, el estado vive al lado del proyecto', () => {
  const r = rutasDeEstado({}, '/raiz');
  assert.equal(r.dir, path.join('/raiz', 'estado'));
});

test('DEPLOY_BOARD_ESTADO manda: es la unica forma de que el equipo comparta marcas', () => {
  const r = rutasDeEstado({ DEPLOY_BOARD_ESTADO: '/compartido' }, '/raiz');
  assert.equal(r.dir, '/compartido');
});

test('una marca guardada vuelve a leerse despues de reabrir el almacen', () => {
  const dir = carpetaTemporal();
  try {
    crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).guardarMarcas({ marcas: { a: { subidoAMain: true } }, ignorados: {} });
    assert.equal(crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).leerMarcas().marcas.a.subidoAMain, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la carpeta se crea sola: nadie tiene que acordarse de hacer mkdir', () => {
  const dir = path.join(carpetaTemporal(), 'todavia', 'no', 'existe');
  try {
    crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).guardarVista({ meta: { total: 1 } });
    assert.equal(fs.existsSync(path.join(dir, 'vista.json')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('un JSON a medio escribir NO borra las marcas: se lee vacio y se avisa afuera', () => {
  const dir = carpetaTemporal();
  try {
    fs.writeFileSync(path.join(dir, 'marcas.json'), '{"marcas": {"a"');
    assert.deepEqual(crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).leerMarcas(), { marcas: {}, ignorados: {} });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sin medicion previa leerVista devuelve null, no un objeto vacio', () => {
  const dir = carpetaTemporal();
  try {
    assert.equal(crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).leerVista(), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
