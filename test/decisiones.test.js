import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firmaDe, claveDeSprint, normalizarDecisiones, aplicarCambioDecision, aplicarDecisiones, desviosResueltos,
} from '../src/decisiones.js';

const d2 = { codigo: 'D2', severidad: 'bloqueante', titulo: 'Falta en stage', detalle: 'a.sql — no corrio', scriptId: 's1', wiId: 10, responsable: 'Ana' };
const d6 = { codigo: 'D6', severidad: 'alto', titulo: 'Adjunto sin repo', detalle: 'b.sql', scriptId: 's2', wiId: 10, responsable: 'Beto' };
const d8 = { codigo: 'D8', severidad: 'medio', titulo: 'CantidadScripts', detalle: 'dice 3 y hay 2', wiId: 10, responsable: 'Ana' };

function vistaCon(desvios, filas = [{ id: 's1', hash: 'h1' }, { id: 's2', hash: 'h2' }]) {
  return {
    meta: { sprint: 'Sprint_A', bloqueantes: 99, listo: false },
    filas,
    desvios: desvios.map((d) => ({ ...d, firma: firmaDe(d) })),
    personas: [],
    revisar: [{ wiId: 10, firmas: desvios.filter((d) => d.codigo === 'D6').map(firmaDe) }],
  };
}

test('la firma cambia si cambia el hecho, aunque el codigo sea el mismo', () => {
  assert.equal(firmaDe(d2), firmaDe({ ...d2 }));
  assert.notEqual(firmaDe(d2), firmaDe({ ...d2, detalle: 'a.sql — no corrio en dev tampoco' }));
  assert.notEqual(firmaDe(d2), firmaDe({ ...d2, scriptId: 's9' }));
});

test('la firma no depende del responsable ni de la severidad: son derivados, no el hecho', () => {
  assert.equal(firmaDe(d2), firmaDe({ ...d2, responsable: 'Otro', severidad: 'alto' }));
});

test('el sprint de una vista sale de la carpeta, y sin carpeta de la iteracion', () => {
  assert.equal(claveDeSprint({ sprint: 'Sprint_A', iteracion: 'Fidel\\S5' }), 'Sprint_A');
  assert.equal(claveDeSprint({ sprint: null, iteracion: 'Fidel\\S5' }), 'Fidel\\S5');
  assert.equal(claveDeSprint({}), 'sin-sprint');
});

test('un archivo sin nada se normaliza a version 0 y sin sprints', () => {
  assert.deepEqual(normalizarDecisiones(null), { version: 0, sprints: {} });
  assert.deepEqual(normalizarDecisiones({ version: 3, sprints: { S: { marcas: { a: {} } } } }).sprints.S,
    { marcas: { a: {} }, ignorados: {}, aceptados: {} });
});

test('aceptar sin motivo se rechaza: una aceptacion sin porque no se puede discutir despues', () => {
  assert.throws(() => aplicarCambioDecision(normalizarDecisiones(null),
    { sprint: 'S', tipo: 'aceptado', clave: 'f1', poner: true, codigo: 'D2', motivo: '   ' }), /motivo/);
});

test('ignorar sin motivo tambien se rechaza', () => {
  assert.throws(() => aplicarCambioDecision(normalizarDecisiones(null),
    { sprint: 'S', tipo: 'ignorado', clave: 's1', poner: true, hash: 'h1', motivo: '' }), /motivo/);
});

test('marcar como subido a main no pide motivo, pero guarda el hash de lo que se marco', () => {
  const r = aplicarCambioDecision(normalizarDecisiones(null),
    { sprint: 'S', tipo: 'marca', clave: 's1', poner: true, hash: 'h1', quien: 'Ana', fecha: '2026-09-25' });
  assert.deepEqual(r.sprints.S.marcas.s1, { hash: 'h1', por: 'Ana', fecha: '2026-09-25' });
});

test('sacar una decision la borra, y quitar algo que no estaba no es un error', () => {
  let r = aplicarCambioDecision(normalizarDecisiones(null), { sprint: 'S', tipo: 'aceptado', clave: 'f1', poner: true, codigo: 'D2', motivo: 'ok' });
  r = aplicarCambioDecision(r, { sprint: 'S', tipo: 'aceptado', clave: 'f1', poner: false });
  assert.deepEqual(r.sprints.S.aceptados, {});
  assert.doesNotThrow(() => aplicarCambioDecision(r, { sprint: 'S', tipo: 'marca', clave: 'zz', poner: false }));
});

test('una decision de un sprint no toca las de otro', () => {
  let r = aplicarCambioDecision(normalizarDecisiones(null), { sprint: 'A', tipo: 'marca', clave: 's1', poner: true, hash: 'h1' });
  r = aplicarCambioDecision(r, { sprint: 'B', tipo: 'marca', clave: 's1', poner: true, hash: 'h9' });
  assert.equal(r.sprints.A.marcas.s1.hash, 'h1');
  assert.equal(r.sprints.B.marcas.s1.hash, 'h9');
});

test('tipo desconocido, clave vacia o sin sprint se rechazan', () => {
  const base = normalizarDecisiones(null);
  assert.throws(() => aplicarCambioDecision(base, { sprint: 'S', tipo: 'x', clave: 'a', poner: true }));
  assert.throws(() => aplicarCambioDecision(base, { sprint: 'S', tipo: 'marca', clave: '', poner: true, hash: 'h' }));
  assert.throws(() => aplicarCambioDecision(base, { sprint: '', tipo: 'marca', clave: 'a', poner: true, hash: 'h' }));
});

test('sin decisiones, bloqueantes y listo salen de los desvios de la medicion', () => {
  const v = aplicarDecisiones(vistaCon([d2, d6, d8]), {});
  assert.equal(v.meta.bloqueantes, 1);
  assert.equal(v.meta.listo, false);
  assert.ok(v.desvios.every((d) => d.estado === 'abierto'));
});

test('un desvio aceptado deja de bloquear y sale de los pendientes, pero sigue en la lista marcado como aceptado', () => {
  const v = aplicarDecisiones(vistaCon([d2, d6]), { aceptados: { [firmaDe(d2)]: { codigo: 'D2', por: 'Ana', fecha: 'f', motivo: 'se corre a mano' } } });
  assert.equal(v.meta.bloqueantes, 0);
  assert.equal(v.meta.listo, true);
  const acep = v.desvios.find((d) => d.codigo === 'D2');
  assert.equal(acep.estado, 'aceptado');
  assert.equal(acep.aceptado.motivo, 'se corre a mano');
  assert.equal(v.personas.some((g) => g.pendientes.some((p) => p.codigo === 'D2')), false);
});

test('una aceptacion vieja no cubre un desvio con el mismo codigo y otros hechos', () => {
  const viejo = { ...d2, detalle: 'otro texto' };
  const v = aplicarDecisiones(vistaCon([d2]), { aceptados: { [firmaDe(viejo)]: { codigo: 'D2', motivo: 'x' } } });
  assert.equal(v.meta.bloqueantes, 1);
  assert.equal(v.desvios[0].estado, 'abierto');
});

test('los desvios de un script ignorado o ya en main no cuentan como pendientes de nadie', () => {
  const v = aplicarDecisiones(vistaCon([d2, d6]), {
    ignorados: { s1: { hash: 'h1', motivo: 'no va' } },
    marcas: { s2: { hash: 'h2' } },
  });
  assert.equal(v.meta.bloqueantes, 0);
  assert.deepEqual(v.personas, []);
});

test('una marca sobre otra version del script NO aplica y la fila lo dice', () => {
  const v = aplicarDecisiones(vistaCon([d2]), { marcas: { s1: { hash: 'viejo', por: 'Ana' } } });
  const f = v.filas.find((x) => x.id === 's1');
  assert.equal(f.marca, null);
  assert.equal(f.marcaVencida, true);
  assert.equal(v.meta.bloqueantes, 1);
});

test('un ignorado sobre otra version tampoco aplica', () => {
  const v = aplicarDecisiones(vistaCon([d2]), { ignorados: { s1: { hash: 'viejo', motivo: 'x' } } });
  const f = v.filas.find((x) => x.id === 's1');
  assert.equal(f.ignorado, null);
  assert.equal(f.ignoradoVencido, true);
});

test('una marca vigente llega en la fila con autor y fecha', () => {
  const v = aplicarDecisiones(vistaCon([]), { marcas: { s1: { hash: 'h1', por: 'Ana', fecha: 'f' } } });
  assert.deepEqual(v.filas.find((x) => x.id === 's1').marca, { hash: 'h1', por: 'Ana', fecha: 'f' });
});

test('un desvio sin script (de work item) no se apaga por marcas de scripts', () => {
  const v = aplicarDecisiones(vistaCon([d8]), { marcas: { s1: { hash: 'h1' } }, ignorados: { s2: { hash: 'h2', motivo: 'x' } } });
  assert.equal(v.personas.flatMap((g) => g.pendientes).length, 1);
});

test('un bloque de revisar a mano con todos sus desvios aceptados sale de la lista', () => {
  const v = aplicarDecisiones(vistaCon([d6]), { aceptados: { [firmaDe(d6)]: { codigo: 'D6', motivo: 'x' } } });
  assert.deepEqual(v.revisar, []);
  const abierto = aplicarDecisiones(vistaCon([d6]), {});
  assert.equal(abierto.revisar.length, 1);
});

test('aplicar decisiones no modifica la vista guardada', () => {
  const v = vistaCon([d2]);
  const copia = JSON.parse(JSON.stringify(v));
  aplicarDecisiones(v, { aceptados: { [firmaDe(d2)]: { motivo: 'x' } } });
  assert.deepEqual(v, copia);
});

test('una vista de antes de las firmas igual se puede aplicar: la firma se calcula al vuelo', () => {
  const v = vistaCon([d2]);
  delete v.desvios[0].firma;
  const r = aplicarDecisiones(v, { aceptados: { [firmaDe(d2)]: { motivo: 'x' } } });
  assert.equal(r.desvios[0].estado, 'aceptado');
});

test('resueltos: lo que estaba en la medicion anterior del mismo sprint y ya no esta', () => {
  const antes = vistaCon([d2, d6]);
  const ahora = vistaCon([d6]);
  const r = desviosResueltos(antes, ahora);
  assert.deepEqual(r.map((d) => d.codigo), ['D2']);
});

test('resueltos contra otro sprint no se calcula: no es la medicion anterior de este', () => {
  const antes = vistaCon([d2]);
  const ahora = { ...vistaCon([]), meta: { sprint: 'Sprint_B' } };
  assert.deepEqual(desviosResueltos(antes, ahora), []);
  assert.deepEqual(desviosResueltos(null, ahora), []);
});
