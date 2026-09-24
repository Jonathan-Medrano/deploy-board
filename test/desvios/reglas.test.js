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

test('D1 encuentra el script aunque su id cambio por emparejamiento: busca en aliases', () => {
  const d = detectarDesvios({
    scripts: [sc({ id: '25051/sp_algo', wiId: 25051, aliases: ['30015/sp_algo'] })],
    wis: [wi({ id: 25051, estado: 'Tested' })],
    tasks: [{ id: 30015, titulo: 'Scripts', estado: 'In Test', adjuntos: ['30015/sp_algo'] }],
    estados: { '25051/sp_algo': verde }, destino: 'stage',
  });
  const d1 = d.find((x) => x.codigo === 'D1');
  assert.ok(d1, 'D1 debe encontrarse buscando el alias de la task');
  assert.equal(d1.wiId, 25051);
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

test('D12: contenido distinto entre versiones del mismo script', () => {
  const d = detectarDesvios({
    scripts: [sc({
      contenidoDistinto: true, fuentes: ['adjunto', 'repo'], creado: '2026-09-20',
      versiones: [
        { fuente: 'adjunto', donde: 900, hash: 'h1' }, { fuente: 'repo', donde: 'US-1', hash: 'h2' },
      ],
    })],
    wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  const d12 = d.find((x) => x.codigo === 'D12');
  assert.ok(d12, JSON.stringify(d.map((x) => x.codigo)));
  assert.equal(d12.severidad, 'alto');
  assert.match(d12.detalle, /adjunto 900/);
  assert.match(d12.detalle, /repo US-1/);
  assert.match(d12.detalle, /Se midio la del adjunto mas reciente/, 'con `creado`, si se puede afirmar que es la mas reciente');
});

test('D12 sin `creado` en el adjunto medido: no se afirma "mas reciente" porque no se sabe', () => {
  const d = detectarDesvios({
    scripts: [sc({
      contenidoDistinto: true, fuentes: ['adjunto', 'repo'],
      versiones: [
        { fuente: 'adjunto', donde: 900, hash: 'h1' }, { fuente: 'repo', donde: 'US-1', hash: 'h2' },
      ],
    })],
    wis: [wi()], tasks: [], estados: { a: verde }, destino: 'stage',
  });
  const d12 = d.find((x) => x.codigo === 'D12');
  assert.ok(d12, JSON.stringify(d.map((x) => x.codigo)));
  assert.match(d12.detalle, /Se midio la del adjunto\./, 'sin `creado` no hay con que comparar cual es la mas nueva');
  assert.doesNotMatch(d12.detalle, /mas reciente/);
});

test('rolesDesde lee la configuracion y no inventa nombres', () => {
  assert.deepEqual(rolesDesde({ RESPONSABLE_PROMOCION: 'Ana', RESPONSABLE_PRODUCCION: 'Deploy' }),
    { promocion: 'Ana', produccion: 'Deploy' });
  assert.deepEqual(rolesDesde({}), { promocion: null, produccion: null });
  assert.deepEqual(rolesDesde({ RESPONSABLE_PROMOCION: '' }), { promocion: null, produccion: null });
});

test('D3 no dispara si el destino no se midio: no se afirma lo que no se pregunto', () => {
  const d = detectarDesvios({
    scripts: [sc({ esPre: true })], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'OK' } } }, destino: 'stage', ambientes: ['dev'],
  });
  assert.equal(d.some((x) => x.codigo === 'D3'), false);
});

test('D3 sigue disparando si el destino se midio y falta', () => {
  const d = detectarDesvios({
    scripts: [sc({ esPre: true })], wis: [wi()], tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } }, destino: 'stage', ambientes: ['dev', 'stage'],
  });
  assert.ok(d.some((x) => x.codigo === 'D3'));
});

test('D4 no dispara si stage no se midio', () => {
  const d = detectarDesvios({
    scripts: [sc()], wis: [wi({ estado: 'Tested' })], tasks: [],
    estados: { a: { dev: { estado: 'OK' } } }, destino: 'stage', ambientes: ['dev'],
  });
  assert.equal(d.some((x) => x.codigo === 'D4'), false);
});

// ---------------- cerrados y pausados no van en la subida ----------------
const estadosCorrioEnDev = { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } };

for (const estadoWi of ['Closed', 'Done', 'closed', 'Paused']) {
  test(`un script de un work item en "${estadoWi}" no dispara D2, D3 ni D4`, () => {
    const ds = detectarDesvios({
      scripts: [sc({ esPre: true })],
      wis: [{ id: 1, estado: estadoWi, asignadoA: 'Ana' }],
      estados: estadosCorrioEnDev, ambientes: ['dev', 'stage'],
    });
    const codigos = ds.map((d) => d.codigo);
    for (const c of ['D2', 'D3', 'D4']) assert.equal(codigos.includes(c), false, `${estadoWi}: ${codigos.join(',')}`);
  });
}

test('D13: pausado pero ya corrio en algun ambiente, alto, a nombre del dueno del work item', () => {
  const ds = detectarDesvios({
    scripts: [sc({ responsables: { subioElAdjunto: { nombre: 'Beto' } } })],
    wis: [{ id: 1, estado: 'Paused', asignadoA: 'Ana' }],
    estados: estadosCorrioEnDev, ambientes: ['dev', 'stage'],
  });
  const d13 = ds.filter((d) => d.codigo === 'D13');
  assert.equal(d13.length, 1, ds.map((d) => d.codigo).join(','));
  assert.equal(d13[0].severidad, 'alto');
  assert.equal(d13[0].responsable, 'Ana');
  assert.equal(d13[0].scriptId, 'a');
  assert.match(d13[0].titulo, /Pausado pero corrio en dev/);
});

test('D13 no sale si el pausado no corrio en ningun lado, ni para un cerrado que corrio', () => {
  const pausadoSinCorrer = detectarDesvios({
    scripts: [sc()], wis: [{ id: 1, estado: 'Paused' }],
    estados: { a: { dev: { estado: 'FALTA' }, stage: { estado: 'FALTA' } } }, ambientes: ['dev', 'stage'],
  });
  assert.equal(pausadoSinCorrer.some((d) => d.codigo === 'D13'), false);
  const cerrado = detectarDesvios({
    scripts: [sc()], wis: [{ id: 1, estado: 'Closed' }], estados: estadosCorrioEnDev, ambientes: ['dev', 'stage'],
  });
  assert.equal(cerrado.some((d) => d.codigo === 'D13'), false);
});

test('un work item activo sigue disparando D2 como siempre', () => {
  const ds = detectarDesvios({
    scripts: [sc()], wis: [{ id: 1, estado: 'Active' }], estados: estadosCorrioEnDev, ambientes: ['dev', 'stage'],
  });
  assert.ok(ds.some((d) => d.codigo === 'D2'));
});

// ---------------- review de 5468f60 ----------------
test('B-25038: un WI traido de fuera del sprint no dispara D1 contra la task del sprint', () => {
  const ds = detectarDesvios({
    scripts: [sc({ id: 'a', wiId: 25038, esPre: true })],
    wis: [{ id: 25038, estado: 'Closed', fueraDelSprint: true }],
    tasks: [{ id: 30015, estado: 'Active', adjuntos: ['a'] }],
    estados: {}, ambientes: ['dev', 'stage'],
  });
  assert.equal(ds.some((d) => d.codigo === 'D1'), false, ds.map((d) => `${d.codigo}/${d.severidad}`).join(','));
});

test('un WI de fuera del sprint no dispara D8 (solo se ven sus scripts de este sprint), D9 si', () => {
  const ds = detectarDesvios({
    scripts: [sc({ objetos: [{ tipo: 'PROCEDURE', nombre: 'sp_a' }] })],
    wis: [{ id: 1, estado: 'Active', cantidadScripts: 3, tieneSP: '0 - No', fueraDelSprint: true }],
    estados: {},
  });
  const codigos = ds.map((d) => d.codigo);
  assert.equal(codigos.includes('D8'), false, codigos.join(','));
  assert.ok(codigos.includes('D9'), codigos.join(','));
});

for (const [estadoWi, estadoTask] of [['Closed', 'Active'], ['Done', 'Active'], ['Paused', 'New']]) {
  test(`D1 para un WI en "${estadoWi}" baja a medio: no va en la subida`, () => {
    const ds = detectarDesvios({
      scripts: [sc({ id: 'a', wiId: 1 })],
      wis: [{ id: 1, estado: estadoWi }],
      tasks: [{ id: 9, estado: estadoTask, adjuntos: ['a'] }],
      estados: {},
    });
    const d1 = ds.filter((d) => d.codigo === 'D1');
    assert.equal(d1.length, 1, ds.map((d) => d.codigo).join(','));
    assert.equal(d1[0].severidad, 'medio');
  });
}

test('D1 para un WI activo sigue siendo bloqueante', () => {
  const ds = detectarDesvios({
    scripts: [sc({ id: 'a', wiId: 1 })],
    wis: [{ id: 1, estado: 'Tested' }],
    tasks: [{ id: 9, estado: 'Active', adjuntos: ['a'] }],
    estados: {},
  });
  assert.equal(ds.find((d) => d.codigo === 'D1').severidad, 'bloqueante');
});

test('un __NEW sin pareja da D5 pero no D7 ni D11: su nombre es la convencion del equipo', () => {
  const ds = detectarDesvios({
    scripts: [sc({
      archivo: 'Foo__NEW.sql', descripcion: null, accion: null, esNew: true, nombreSp: 'Foo',
      vinculadoPor: 'contenedor', fuentes: ['repo'],
    })],
    wis: [{ id: 1, estado: 'Active' }], estados: {},
  });
  const codigos = ds.map((d) => d.codigo);
  assert.ok(codigos.includes('D5'), codigos.join(','));
  for (const c of ['D7', 'D11']) assert.equal(codigos.includes(c), false, codigos.join(','));
});
