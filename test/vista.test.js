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

test('row.main proyecta el estado que dejo marcarEnMain, y null cuando el script no aparece en el mapa', () => {
  const v = construirVista({ ...reporteBase, enMain: { a: 'igual' }, ramaMain: 'main' });
  assert.equal(v.filas[0].main, 'igual');
  assert.equal(v.filas[1].main, null);
});

test('sin enMain en el reporte, row.main es null para todas las filas (compatibilidad con reportes viejos)', () => {
  const v = construirVista(reporteBase);
  assert.equal(v.filas[0].main, null);
  assert.equal(v.filas[1].main, null);
});

test('meta.ramaMain copia la rama que uso el reporte, o null cuando no se evaluo', () => {
  assert.equal(construirVista({ ...reporteBase, ramaMain: 'main' }).meta.ramaMain, 'main');
  assert.equal(construirVista(reporteBase).meta.ramaMain, null);
});

test('cada fila proyecta subida (cerrado/pausado/null), enRepo y wiFuera', () => {
  const v = construirVista({
    ...reporteBase,
    orden: [
      script({ id: 'c', wiId: 20, fuentes: ['adjunto'] }),
      script({ id: 'p', wiId: 21, fuentes: ['adjunto', 'repo'] }),
      script({ id: 'd', wiId: 22, fuentes: ['repo'] }),
      script({ id: 'n', wiId: 23 }),
    ],
    wis: [
      { id: 20, estado: 'Closed', fueraDelSprint: true },
      { id: 21, estado: 'Paused' },
      { id: 22, estado: 'Done' },
      { id: 23, estado: 'Active' },
    ],
  });
  const f = Object.fromEntries(v.filas.map((x) => [x.id, x]));
  assert.equal(f.c.subida, 'cerrado');
  assert.equal(f.p.subida, 'pausado');
  assert.equal(f.d.subida, 'cerrado');
  assert.equal(f.n.subida, null);
  assert.equal(f.c.enRepo, false);
  assert.equal(f.p.enRepo, true);
  assert.equal(f.d.enRepo, true);
  assert.equal(f.c.wiFuera, true);
  assert.equal(f.p.wiFuera, false);
});

test('la pestana stage -> dev trae sus filas en orden de ejecucion, con dev y stage, y a cargo del rol', () => {
  const v = construirVista({
    ...reporteBase,
    stageToDev: {
      ramaStage: 'master', ramaDev: 'dev',
      orden: [
        script({ id: 'p1', archivo: '[U-25155] - PRE - 01 - Columna - ALTER.sql', wiId: 25155, esPre: true, accion: 'ALTER', descripcion: 'Columna',
          objetos: [{ tipo: 'COLUMN', nombre: 'ListingTypeMELI' }] }),
      ],
      estados: { p1: { dev: { estado: 'FALTA' }, stage: { estado: 'OK' } } },
    },
  });
  assert.equal(v.stageToDev.ramaStage, 'master');
  assert.equal(v.stageToDev.ramaDev, 'dev');
  assert.equal(v.stageToDev.filas.length, 1);
  const f = v.stageToDev.filas[0];
  assert.deepEqual(f.est, { dev: 'FALTA', stage: 'OK' });
  assert.equal(f.pre, true);
  assert.equal(f.wi, 25155);
  assert.equal(f.resp, 'Encargado de ejecutar scripts');
});

test('sin medicion de stage -> dev la vista lo dice con null, no con una lista vacia', () => {
  assert.equal(construirVista(reporteBase).stageToDev, null);
});
