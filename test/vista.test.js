import test from 'node:test';
import assert from 'node:assert/strict';
import { tipoDeScript, construirVista } from '../src/vista.js';

const script = (extra = {}) => ({
  id: 'x', archivo: 'x.sql', wiId: 1, esPre: false, accion: null,
  descripcion: 'x', vinculadoPor: 'nombre', objetos: [], ...extra,
});

test('un script que toca un PROCEDURE es de tipo sp', () => {
  assert.equal(tipoDeScript(script({ objetos: [{ tipo: 'PROCEDURE', nombre: 'sp_a' }] })), 'sp');
});

test('una FUNCTION cuenta como sp: las dos son codigo que se reemplaza entero', () => {
  assert.equal(tipoDeScript(script({ objetos: [{ tipo: 'FUNCTION', nombre: 'f_a' }] })), 'sp');
});

test('el PROCEDURE manda sobre la tabla que el script tambien toca', () => {
  const s = script({ objetos: [{ tipo: 'TABLE', nombre: 'T' }, { tipo: 'PROCEDURE', nombre: 'sp_a' }] });
  assert.equal(tipoDeScript(s), 'sp');
});

test('solo FILA es tipo datos', () => {
  assert.equal(tipoDeScript(script({ objetos: [{ tipo: 'FILA', nombre: 'Setting' }] })), 'datos');
});

test('columnas, tablas e indices son estructura', () => {
  const s = script({ objetos: [{ tipo: 'COLUMN', nombre: 'C' }, { tipo: 'INDEX', nombre: 'I' }] });
  assert.equal(tipoDeScript(s), 'estructura');
});

test('sin objetos el tipo es null y no se inventa uno', () => {
  assert.equal(tipoDeScript(script({ objetos: [] })), null);
});

const reporteBase = {
  destino: 'stage',
  ambientes: ['dev', 'stage'],
  bloqueantes: 1,
  listoParaSubir: false,
  orden: [
    script({
      id: 'a', archivo: '[U-10] - PRE - Algo - ALTER.sql', wiId: 10, esPre: true, accion: 'ALTER',
      descripcion: 'Algo', objetos: [{ tipo: 'COLUMN', nombre: 'Col' }], contenedorPadre: 99,
    }),
    script({
      id: 'b', archivo: 'sp_Otro.sql', wiId: 11, accion: null, descripcion: 'sp_Otro',
      vinculadoPor: 'contenedor', objetos: [{ tipo: 'PROCEDURE', nombre: 'sp_Otro' }],
    }),
  ],
  estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } },
  wis: [
    { id: 10, tipo: 'User Story', titulo: 'Diez', estado: 'In Test', asignadoA: 'Ana Perez' },
    { id: 11, tipo: 'Bug', titulo: 'Once', estado: 'Active', asignadoA: null },
  ],
  tasks: [],
  desvios: [{ codigo: 'D2', severidad: 'bloqueante', titulo: 'T', detalle: 'D', responsable: null, scriptId: 'a', wiId: 10 }],
  pendientesPorResponsable: [{ responsable: 'Ana Perez', pendientes: [{ codigo: 'D2', severidad: 'bloqueante', scriptId: 'a', accion: 'Ejecutar', motivos: ['m'] }] }],
  revisarAMano: [{ wiId: 10, titulo: 'Diez', enLaTarjeta: 1, enElRepo: 0, afectaEstePase: false, soloEnLaTarjeta: ['x'], soloEnElRepo: [], numeradosDistinto: [], responsable: 'Ana Perez' }],
  sinVeredicto: [],
};

test('cada fila lleva el estado de CADA ambiente medido, no dos columnas fijas', () => {
  const v = construirVista(reporteBase);
  assert.deepEqual(v.filas[0].est, { dev: 'OK', stage: 'FALTA' });
});

test('un script sin medicion muestra un guion, no un OK optimista', () => {
  const v = construirVista(reporteBase);
  assert.deepEqual(v.filas[1].est, { dev: '-', stage: '-' });
});

test('el responsable de la fila es el dueno de la tarjeta', () => {
  const v = construirVista(reporteBase);
  assert.equal(v.filas[0].resp, 'Ana Perez');
});

test('la fila arrastra estado y titulo del work item para no volver a buscarlos', () => {
  const v = construirVista(reporteBase);
  assert.equal(v.filas[0].wiEstado, 'In Test');
  assert.equal(v.filas[0].wiTit, 'Diez');
});

test('el orden de las filas es el orden de ejecucion del reporte', () => {
  const v = construirVista(reporteBase);
  assert.deepEqual(v.filas.map((f) => f.id), ['a', 'b']);
});

test('meta copia el veredicto del reporte en vez de recalcularlo', () => {
  const v = construirVista(reporteBase, { medido: '2026-09-22T00:00:00.000Z' });
  assert.equal(v.meta.bloqueantes, 1);
  assert.equal(v.meta.listo, false);
  assert.equal(v.meta.medido, '2026-09-22T00:00:00.000Z');
});

test('meta arma la URL base de los work items desde la organizacion configurada', () => {
  const v = construirVista(reporteBase, { org: 'https://agenciap.visualstudio.com', proyecto: 'Fidel' });
  assert.equal(v.meta.wiBase, 'https://agenciap.visualstudio.com/Fidel/_workitems/edit/');
});

test('sin organizacion configurada wiBase queda null y la pantalla no linkea a ningun lado', () => {
  const v = construirVista(reporteBase, {});
  assert.equal(v.meta.wiBase, null);
});

test('los desvios y el agrupado por persona viajan tal cual los calculo el reporte', () => {
  const v = construirVista(reporteBase);
  assert.equal(v.desvios.length, 1);
  assert.equal(v.desvios[0].codigo, 'D2');
  assert.equal(v.personas[0].responsable, 'Ana Perez');
  assert.equal(v.revisar[0].wiId, 10);
});

test('la vista cuenta cuantos scripts hay de cada tipo', () => {
  const v = construirVista(reporteBase);
  assert.deepEqual(v.meta.porTipo, { estructura: 1, sp: 1 });
});
