import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarDesvios } from '../../src/desvios/reglas.js';
import { rolesDesde } from '../../src/roles.js';

// El helper trae un nombre VALIDO a proposito: si no, D11 dispararia en los 22 tests y
// taparia lo que cada uno quiere medir.
const sc = (o = {}) => ({
  id: 'a', archivo: '[U-1] - Columna X en Tabla - ALTER.sql', wiId: 1, esPre: false,
  descripcion: 'Columna X en Tabla', accion: 'ALTER',
  fuentes: ['adjunto', 'repo'], objetos: [], ...o,
});
const wi = (o = {}) => ({ id: 1, tipo: 'User Story', titulo: 't', estado: 'Active', cantidadScripts: null, tieneSP: null, tieneReporte: null, asignadoA: 'Dueno WI', ...o });
const verde = { dev: { estado: 'OK' }, stage: { estado: 'OK' }, sandbox: { estado: 'OK' } };
const codigos = (d) => d.map((x) => x.codigo).sort();

test('D1: la madre en Tested y la task de SCRIPTS en In Test', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ estado: 'Tested' })],
    tasks: [{ id: 900, titulo: 'Scripts', estado: 'In Test', adjuntos: ['a'] }],
    estados: { a: verde }, destino: 'stage',
  });
  const d1 = d.find((x) => x.codigo === 'D1');
  assert.ok(d1);
  assert.equal(d1.severidad, 'bloqueante');
  assert.deepEqual(d1.accion, { tipo: 'setEstado', id: 900, valor: 'Tested' });
});

test('D1 sale UNA vez por task, aunque la task tenga varios scripts', () => {
  const d = detectarDesvios({
    scripts: [sc({ id: 'a' }), sc({ id: 'b' }), sc({ id: 'c' })],
    wis: [wi({ estado: 'Tested' })],
    tasks: [{ id: 900, titulo: 'Scripts', estado: 'In Test', adjuntos: ['a', 'b', 'c'] }],
    estados: { a: verde, b: verde, c: verde }, destino: 'stage',
  });
  const d1 = d.filter((x) => x.codigo === 'D1');
  assert.equal(d1.length, 1, 'tres scripts en la misma task no son tres problemas');
  assert.equal(d1[0].taskId, 900);
});

test('D1 no arrastra scriptId: no es un problema de un script', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ estado: 'Tested' })],
    tasks: [{ id: 900, titulo: 'Scripts', estado: 'In Test', adjuntos: ['a'] }],
    estados: { a: verde }, destino: 'stage',
  });
  assert.equal('scriptId' in d.find((x) => x.codigo === 'D1'), false);
});

test('ningun desvio expone el campo interno ambiente', () => {
  const d = detectarDesvios({
    scripts: [sc({ esPre: true })], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } },
    destino: 'stage', roles: { promocion: 'Ana', produccion: 'Deploy' },
  });
  assert.ok(d.length);
  for (const x of d) assert.equal('ambiente' in x, false, `${x.codigo} expuso ambiente`);
});

test('sin rol de promocion el desvio de ejecucion sale SIN nombre, no con el autor', () => {
  const d = detectarDesvios({
    scripts: [sc({ esPre: true })], wis: [wi({ asignadoA: 'Autor del script' })], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } },
    destino: 'stage', roles: { promocion: null, produccion: null },
  });
  assert.equal(d.find((x) => x.codigo === 'D3').responsable, null,
    'el autor NO ejecuta en el ambiente destino de una promocion');
});

test('D11: descripcion vacia y caracteres invalidos en Windows', () => {
  const vacia = detectarDesvios({
    scripts: [sc({ descripcion: '   ' })], wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.match(vacia.find((x) => x.codigo === 'D11').detalle, /descripcion/);

  const invalidos = detectarDesvios({
    scripts: [sc({ archivo: '[U-1] - Columna X: Tabla? - ALTER.sql' })],
    wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.match(invalidos.find((x) => x.codigo === 'D11').detalle, /invalidos en Windows/);
});

test('D1 NO dispara si el script no cuelga de ninguna task de SCRIPTS', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ estado: 'Tested' })], tasks: [],
    estados: { a: verde }, destino: 'stage',
  });
  assert.equal(d.some((x) => x.codigo === 'D1'), false);
});

test('D1 NO dispara con un estado desconocido: avisa, no adivina', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ estado: 'Esperando Deploy' })],
    tasks: [{ id: 900, titulo: 'S', estado: 'In Test', adjuntos: ['a'] }],
    estados: { a: verde }, destino: 'stage',
  });
  assert.equal(d.some((x) => x.codigo === 'D1'), false);
});

test('D2: corrio en dev y falta en el destino es bloqueante', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' }, sandbox: { estado: '?' } } },
    destino: 'stage',
  });
  const d2 = d.find((x) => x.codigo === 'D2');
  assert.equal(d2.severidad, 'bloqueante');
  assert.match(d2.titulo, /dev.*stage/);
});

test('D2 al reves: corrio en stage y falta en dev — alguien lo ejecuto salteando el flujo', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'FALTA' }, stage: { estado: 'OK' } } },
    destino: 'stage',
  });
  const d2 = d.find((x) => x.codigo === 'D2');
  assert.ok(d2, 'la divergencia inversa tambien es un desvio');
  assert.equal(d2.severidad, 'alto');
  assert.match(d2.titulo, /stage.*dev/);
});

test('D2 nombra los ambientes en el orden real, sin direccion privilegiada', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'OK' }, sandbox: { estado: 'FALTA' } } },
    destino: 'stage',
  });
  const d2 = d.find((x) => x.codigo === 'D2');
  assert.match(d2.titulo, /dev, stage.*sandbox/);
  assert.equal(d2.severidad, 'alto');
});

test('D2 no dispara si todos los medidos coinciden', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'FALTA' }, stage: { estado: 'FALTA' } } },
    destino: 'dev',
  });
  assert.equal(d.some((x) => x.codigo === 'D2'), false);
});

test('un ? no cuenta como divergencia: no se sabe, no se afirma', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: '?' } } },
    destino: 'dev',
  });
  assert.equal(d.some((x) => x.codigo === 'D2'), false);
});

test('D3: falta un PRE en el ambiente destino', () => {
  const d = detectarDesvios({
    scripts: [sc({ esPre: true })], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' }, sandbox: { estado: 'OK' } } },
    destino: 'stage',
  });
  assert.ok(d.some((x) => x.codigo === 'D3'));
});

test('D4: WI en Tested con el script sin correr en stage', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ estado: 'Tested' })], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: '?' }, sandbox: { estado: 'OK' } } },
    destino: 'stage',
  });
  assert.ok(d.some((x) => x.codigo === 'D4'));
});

test('D5: en el repo pero no adjunto — no se va a subir', () => {
  const d = detectarDesvios({ scripts: [sc({ fuentes: ['repo'] })], wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage' });
  assert.ok(d.some((x) => x.codigo === 'D5' && x.severidad === 'alto'));
});

test('D6: adjunto pero no en el repo — no esta versionado', () => {
  const d = detectarDesvios({ scripts: [sc({ fuentes: ['adjunto'] })], wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage' });
  assert.ok(d.some((x) => x.codigo === 'D6'));
});

test('D7: nombre sin work item', () => {
  const d = detectarDesvios({ scripts: [sc({ wiId: null })], wis: [], tasks: [], estados: { a: verde }, destino: 'stage' });
  assert.ok(d.some((x) => x.codigo === 'D7'));
});

test('D7 baja a medio cuando el script se vinculo por el contenedor', () => {
  const d = detectarDesvios({
    scripts: [sc({ wiId: 17597, vinculadoPor: 'contenedor' })],
    wis: [wi({ id: 17597 })], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  const d7 = d.find((x) => x.codigo === 'D7');
  assert.equal(d7.severidad, 'medio');
  assert.match(d7.titulo, /contenedor/);
});

test('D7 sigue en alto cuando no se pudo vincular a nada', () => {
  const d = detectarDesvios({
    scripts: [sc({ wiId: null, vinculadoPor: null })],
    wis: [], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.equal(d.find((x) => x.codigo === 'D7').severidad, 'alto');
});

test('D8: CantidadScripts no coincide, y trae el PATCH listo', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ cantidadScripts: 5 })], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  const d8 = d.find((x) => x.codigo === 'D8');
  assert.deepEqual(d8.accion, { tipo: 'setCampos', id: 1, valor: { 'Custom.CantidadScripts': 1 } });
});

test('D8 no dispara si el campo esta vacio: vacio no es un valor equivocado', () => {
  const d = detectarDesvios({ scripts: [sc()], wis: [wi({ cantidadScripts: null })], tasks: [], estados: { a: verde }, destino: 'stage' });
  assert.equal(d.some((x) => x.codigo === 'D8'), false);
});

test('D9: TieneSP dice 0 - No pero el script define un procedure', () => {
  const d = detectarDesvios({
    scripts: [sc({ objetos: [{ tipo: 'PROCEDURE', nombre: 'sp_x' }] })],
    wis: [wi({ tieneSP: '0 - No' })], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.ok(d.some((x) => x.codigo === 'D9'));
});

test('D9 NO propone un valor para TieneSP: no puede saber si el objeto ya existia', () => {
  const d = detectarDesvios({
    scripts: [sc({ objetos: [{ tipo: 'PROCEDURE', nombre: 'sp_x' }] })],
    wis: [wi({ tieneSP: '0 - No' })], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  const d9 = d.find((x) => x.codigo === 'D9');
  assert.equal(d9.accion, undefined, 'proponer un valor que no se puede saber es inventarlo');
  assert.match(d9.detalle, /1 - Nuevo.*2 - Cambio/);
});

test('D10: el mismo script numerado distinto en la tarjeta y en el repo', () => {
  const d = detectarDesvios({
    scripts: [sc({ ordenPorFuente: { adjunto: 2, repo: 1 } })],
    wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  const d10 = d.find((x) => x.codigo === 'D10');
  assert.ok(d10);
  assert.equal(d10.severidad, 'alto');
  assert.match(d10.titulo, /2 en la tarjeta.*1 en el repo/);
});

test('D10 NO dispara si el script esta en una sola fuente: no hay con que comparar', () => {
  const d = detectarDesvios({
    scripts: [sc({ fuentes: ['adjunto'], ordenPorFuente: { adjunto: 2, repo: null } })],
    wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.equal(d.some((x) => x.codigo === 'D10'), false);
});

test('D5 señala al que commiteo; D6 al que subio el adjunto', () => {
  const resp = { commiteoEnElRepo: { nombre: 'Emi' }, subioElAdjunto: { nombre: 'Ana' } };
  const soloRepo = detectarDesvios({
    scripts: [sc({ fuentes: ['repo'], responsables: resp })], wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.equal(soloRepo.find((x) => x.codigo === 'D5').responsable, 'Emi');

  const soloAdj = detectarDesvios({
    scripts: [sc({ fuentes: ['adjunto'], responsables: resp })], wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.equal(soloAdj.find((x) => x.codigo === 'D6').responsable, 'Ana');
});

test('sin responsable conocido el desvio sale con null, no con un nombre inventado', () => {
  const d = detectarDesvios({
    scripts: [sc({ fuentes: ['repo'] })], wis: [wi({ asignadoA: null })], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.equal(d.find((x) => x.codigo === 'D5').responsable, null);
});

const ROLES = { promocion: 'Ana', produccion: 'El de deploy' };

test('quien EJECUTA sale del ambiente, no del autor: lo que falta en el DESTINO es del que promueve', () => {
  const d = detectarDesvios({
    scripts: [sc({ esPre: true })], wis: [wi({ asignadoA: 'Autor del script' })], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } },
    destino: 'stage', roles: ROLES,
  });
  assert.equal(d.find((x) => x.codigo === 'D3').responsable, 'Ana');
});

test('lo que falta en un ambiente que NO es el destino lo corre el dev: desarrolla ahi', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ asignadoA: 'Autor del script' })], tasks: [],
    estados: { a: { dev: { estado: 'FALTA' }, stage: { estado: 'OK' } } },
    destino: 'stage', roles: ROLES,
  });
  assert.equal(d.find((x) => x.codigo === 'D2').responsable, 'Autor del script');
});

test('produccion nunca cae en un dev', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ asignadoA: 'Autor del script' })], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, produccion: { estado: 'FALTA' } } },
    destino: 'stage', roles: ROLES,
  });
  assert.equal(d.find((x) => x.codigo === 'D2').responsable, 'El de deploy');
});

test('sin roles configurados el desvio sale sin nombre, nunca con uno inventado', () => {
  const d = detectarDesvios({
    scripts: [sc({ esPre: true })], wis: [wi({ asignadoA: null })], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } },
    destino: 'stage',
  });
  assert.equal(d.find((x) => x.codigo === 'D3').responsable, null);
});

test('D11: el nombre no termina en una ACCION valida', () => {
  const d = detectarDesvios({
    scripts: [sc({ accion: null, archivo: '[U-1] - Algo raro.sql' })],
    wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.match(d.find((x) => x.codigo === 'D11').detalle, /ACCION valida/);
});

test('D11: " - " dentro de la descripcion parsea MAL en silencio', () => {
  const d = detectarDesvios({
    scripts: [sc({ descripcion: 'Columna X - en Tabla' })],
    wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.match(d.find((x) => x.codigo === 'D11').detalle, /separador/);
});

test('D11: acentos y caracteres invalidos en Windows', () => {
  const d = detectarDesvios({
    scripts: [sc({ archivo: '[U-1] - Migración de años - ALTER.sql' })],
    wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.match(d.find((x) => x.codigo === 'D11').detalle, /acentos/);
});

test('D11 señala a quien lo nombro, no al dueno de la tarjeta', () => {
  const d = detectarDesvios({
    scripts: [sc({ accion: null, responsables: { subioElAdjunto: { nombre: 'Ana' } } })],
    wis: [wi({ asignadoA: 'Otro' })], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  assert.equal(d.find((x) => x.codigo === 'D11').responsable, 'Ana');
});

test('sin desvios la lista viene vacia', () => {
  const d = detectarDesvios({ scripts: [sc()], wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage' });
  assert.deepEqual(codigos(d), []);
});

test('los bloqueantes salen primero', () => {
  const d = detectarDesvios({
    scripts: [sc({ fuentes: ['adjunto'] })], wis: [wi({ estado: 'Tested' })], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' }, sandbox: { estado: 'OK' } } },
    destino: 'stage',
  });
  assert.equal(d[0].severidad, 'bloqueante');
});

test('rolesDesde lee la configuracion y no inventa nombres', () => {
  assert.deepEqual(rolesDesde({ RESPONSABLE_PROMOCION: 'Ana', RESPONSABLE_PRODUCCION: 'Deploy' }),
    { promocion: 'Ana', produccion: 'Deploy' });
  assert.deepEqual(rolesDesde({}), { promocion: null, produccion: null });
  assert.deepEqual(rolesDesde({ RESPONSABLE_PROMOCION: '' }), { promocion: null, produccion: null });
});
