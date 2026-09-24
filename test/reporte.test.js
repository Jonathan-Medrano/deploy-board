import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  construirReporte, formatearReporte, agruparRevisarAMano,
  semaforoDe, accionDe, agruparPorResponsable, lineasDeMotivos,
} from '../src/reporte.js';

const divergente = {
  scripts: [
    { id: 'x', archivo: '[U-17714] - 01 - UtilizaPartida_Producto - ALTER.sql', wiId: 17714, esPre: false, orden: 1,
      fuentes: ['adjunto'], ordenPorFuente: { adjunto: 1, repo: null }, objetos: [], sondas: [],
      responsables: { subioElAdjunto: { nombre: 'Ana Maria Gonzalez', fecha: '2026-09-17' } } },
    { id: 'y', archivo: '[U-17714] - 03 - Baja de columna MostrarNumeroPartida - DROP.sql', wiId: 17714, esPre: false, orden: 3,
      fuentes: ['repo'], ordenPorFuente: { adjunto: null, repo: 3 }, objetos: [], sondas: [],
      responsables: { commiteoEnElRepo: { nombre: 'Emi', fecha: '2026-09-15' } } },
    { id: 'z', archivo: '[U-17714] - 02 - Esquema PartidaProducto - CREATE.sql', wiId: 17714, esPre: false, orden: 2,
      fuentes: ['adjunto', 'repo'], ordenPorFuente: { adjunto: 2, repo: 1 }, objetos: [], sondas: [],
      responsables: {} },
  ],
  wis: [{ id: 17714, tipo: 'User Story', titulo: 'Partida de Productos', estado: 'Active',
          cantidadScripts: null, tieneSP: null, tieneReporte: null, asignadoA: 'Ana Maria Gonzalez' }],
  tasks: [],
  estados: { x: { dev: { estado: 'OK' }, stage: { estado: 'OK' } },
             y: { dev: { estado: 'OK' }, stage: { estado: 'OK' } },
             z: { dev: { estado: 'OK' }, stage: { estado: 'OK' } } },
  destino: 'stage',
  ambientes: ['dev', 'stage'],
};

const base = {
  scripts: [
    { id: 'a', archivo: '[U-1] - PRE - Columna X - ALTER.sql', wiId: 1, esPre: true, orden: null, fuentes: ['adjunto', 'repo'], objetos: [], sondas: [] },
    { id: 'b', archivo: '[U-1] - Otro - ALTER.sql', wiId: 1, esPre: false, orden: null, fuentes: ['adjunto', 'repo'], objetos: [], sondas: [] },
  ],
  wis: [{ id: 1, tipo: 'User Story', titulo: 'T', estado: 'Active', cantidadScripts: 2, tieneSP: null, tieneReporte: null }],
  tasks: [],
  estados: {
    a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } },
    b: { dev: { estado: 'OK' }, stage: { estado: 'OK' } },
  },
  destino: 'stage',
  ambientes: ['dev', 'stage'],
};

test('cuenta los bloqueantes', () => {
  const r = construirReporte(base);
  assert.ok(r.bloqueantes >= 2); // D2 y D3 sobre el script 'a'
  assert.equal(r.listoParaSubir, false);
});

test('sin desvios queda listo para subir', () => {
  const r = construirReporte({ ...base, estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'OK' } }, b: base.estados.b } });
  assert.equal(r.bloqueantes, 0);
  assert.equal(r.listoParaSubir, true);
});

test('los PRE van primero aunque lleguen al reves', () => {
  const r = construirReporte({ ...base, scripts: [...base.scripts].reverse() });
  assert.equal(r.orden[0].id, 'a');
  assert.equal(r.orden[1].id, 'b');
});

test('los scripts sin veredicto se listan aparte, con el motivo', () => {
  const r = construirReporte({
    ...base,
    estados: { a: { dev: { estado: '?', nota: 'no pude derivar sonda' }, stage: { estado: 'OK' } }, b: base.estados.b },
  });
  assert.equal(r.sinVeredicto.length, 1);
  assert.match(r.sinVeredicto[0].motivo, /sonda/);
});

test('agrupa D5, D6 y D10 en UN bloque por work item, no en filas sueltas', () => {
  const r = construirReporte(divergente);
  assert.equal(r.revisarAMano.length, 1);
  const g = r.revisarAMano[0];
  assert.equal(g.wiId, 17714);
  assert.equal(g.enLaTarjeta, 2);
  assert.equal(g.enElRepo, 2);
  assert.deepEqual(g.soloEnLaTarjeta, ['[U-17714] - 01 - UtilizaPartida_Producto - ALTER.sql']);
  assert.deepEqual(g.soloEnElRepo, ['[U-17714] - 03 - Baja de columna MostrarNumeroPartida - DROP.sql']);
  assert.deepEqual(g.numeradosDistinto[0], {
    archivo: '[U-17714] - 02 - Esquema PartidaProducto - CREATE.sql', tarjeta: 2, repo: 1,
  });
});

test('construirReporte REENVIA los roles: sin eso el feature entero no existe', () => {
  const entrada = {
    scripts: [{ id: 'a', archivo: 'a.sql', wiId: 1, esPre: true, orden: null, descripcion: 'X', accion: 'ALTER',
                fuentes: ['adjunto', 'repo'], objetos: [], sondas: [], ordenPorFuente: { adjunto: null, repo: null }, responsables: {} }],
    wis: [{ id: 1, tipo: 'User Story', titulo: 'T', estado: 'Active', cantidadScripts: null, tieneSP: null, tieneReporte: null, asignadoA: null }],
    tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } },
    destino: 'stage', ambientes: ['dev', 'stage'],
  };
  const sinRoles = construirReporte(entrada);
  assert.equal(sinRoles.desvios.find((d) => d.codigo === 'D3').responsable, null);

  const conRoles = construirReporte({ ...entrada, roles: { promocion: 'Ana', produccion: 'Fede' } });
  assert.equal(conRoles.desvios.find((d) => d.codigo === 'D3').responsable, 'Ana',
    'construirReporte descarto los roles y las reglas corrieron con la config vacia');
});

test('D2, D3 y D4 del mismo script son UNA accion con varios motivos, no tres tareas', () => {
  const r = construirReporte({
    scripts: [{ id: 'a', archivo: '[U-1] - PRE - X - ALTER.sql', wiId: 1, esPre: true, orden: null, descripcion: 'X', accion: 'ALTER',
                fuentes: ['adjunto', 'repo'], objetos: [], sondas: [], ordenPorFuente: { adjunto: null, repo: null }, responsables: {} }],
    wis: [{ id: 1, tipo: 'User Story', titulo: 'T', estado: 'Tested', cantidadScripts: null, tieneSP: null, tieneReporte: null, asignadoA: null }],
    tasks: [],
    estados: { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } },
    destino: 'stage', ambientes: ['dev', 'stage'], roles: { promocion: 'Ana', produccion: null },
  });
  const juani = r.pendientesPorResponsable.find((g) => g.responsable === 'Ana');
  const ejecutar = juani.pendientes.filter((p) => ['D2', 'D3', 'D4'].includes(p.codigo));
  assert.equal(ejecutar.length, 1, 'tres razones para ejecutar el mismo script no son tres tareas');
  assert.equal(ejecutar[0].motivos.length, 3, 'las tres razones se conservan, no se descartan');
  assert.equal(ejecutar[0].severidad, 'bloqueante');
});

test('varios motivos no repiten el nombre del archivo tres veces', () => {
  const arch = '[U-1] - PRE - X - ALTER.sql';
  const l = lineasDeMotivos([`${arch} — la promocion va a romper.`, `${arch} — los PRE corren antes.`]);
  assert.equal(l[0], arch);
  assert.equal(l.length, 3);
  assert.equal(l.filter((x) => x.includes(arch)).length, 1, 'el nombre va una sola vez');
});

test('si los motivos no comparten prefijo se imprimen enteros, sin recortar nada', () => {
  const l = lineasDeMotivos(['a.sql — uno', 'b.sql — dos']);
  assert.deepEqual(l, ['a.sql — uno', 'b.sql — dos']);
});

test('el bloque nombra a un responsable', () => {
  assert.equal(construirReporte(divergente).revisarAMano[0].responsable, 'Ana Maria Gonzalez');
});

test('un WI que no llego a Tested afecta al PROXIMO pase, no a este', () => {
  assert.equal(construirReporte(divergente).revisarAMano[0].afectaEstePase, false);
  const testeado = { ...divergente, wis: [{ ...divergente.wis[0], estado: 'Tested' }] };
  assert.equal(construirReporte(testeado).revisarAMano[0].afectaEstePase, true);
});

test('el formato imprime el bloque con los dos conteos y el responsable', () => {
  const txt = formatearReporte(construirReporte(divergente));
  assert.match(txt, /REVISAR A MANO — US 17714/);
  assert.match(txt, /2 adjuntos y el repo 2 scripts/);
  assert.match(txt, /PROXIMO pase/);
  assert.match(txt, /Ana Maria Gonzalez/);
});

test('sin divergencias el bloque no aparece', () => {
  assert.deepEqual(construirReporte(base).revisarAMano, []);
});

test('el semaforo resume la fila: bloqueante, atencion o verde', () => {
  const s = { id: 'a', wiId: 17714 };
  const est = { a: { dev: { estado: 'OK' }, stage: { estado: 'OK' } } };
  assert.equal(semaforoDe(s, [{ scriptId: 'a', severidad: 'bloqueante' }], est, ['dev', 'stage']), '⛔');
  assert.equal(semaforoDe(s, [{ scriptId: 'a', severidad: 'medio' }], est, ['dev', 'stage']), '🟠');
  assert.equal(semaforoDe(s, [], est, ['dev', 'stage']), '✅');
  assert.equal(semaforoDe(s, [], { a: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } } }, ['dev', 'stage']), '🟠');
});

test('un desvio del work item sin scriptId igual pinta la fila', () => {
  const s = { id: 'a', wiId: 17714 };
  const est = { a: { dev: { estado: 'OK' }, stage: { estado: 'OK' } } };
  const d1 = [{ codigo: 'D1', severidad: 'bloqueante', wiId: 17714, taskId: 900 }];
  assert.equal(semaforoDe(s, d1, est, ['dev', 'stage']), '⛔',
    'con la fila en verde nadie encuentra cual script bloquea la subida');
  const deOtroWi = [{ codigo: 'D1', severidad: 'bloqueante', wiId: 99999, taskId: 900 }];
  assert.equal(semaforoDe(s, deOtroWi, est, ['dev', 'stage']), '✅');
});

test('cada desvio se traduce a un VERBO, no a un diagnostico', () => {
  assert.match(accionDe({ codigo: 'D5' }), /^Adjuntar/);
  assert.match(accionDe({ codigo: 'D6' }), /^Commitear/);
  assert.match(accionDe({ codigo: 'D3' }), /^Ejecutar/);
  assert.match(accionDe({ codigo: 'D1', accion: { valor: 'Tested' } }), /Tested/);
});

test('agrupa los pendientes por responsable, con los bloqueantes primero', () => {
  const g = agruparPorResponsable([
    { codigo: 'D8', severidad: 'medio', responsable: 'Emi', detalle: 'x' },
    { codigo: 'D6', severidad: 'alto', responsable: 'Ana', detalle: 'y' },
    { codigo: 'D3', severidad: 'bloqueante', responsable: 'Ana', detalle: 'z' },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].responsable, 'Ana');
  assert.equal(g[0].pendientes.length, 2);
  assert.equal(g[0].pendientes[0].severidad, 'bloqueante');
});

test('un desvio sin responsable no se pierde: cae en un grupo propio', () => {
  const g = agruparPorResponsable([{ codigo: 'D7', severidad: 'alto', responsable: null, detalle: 'x' }]);
  assert.match(g[0].responsable, /sin responsable/);
});

test('el formato imprime la tabla con cabecera y la lista por responsable', () => {
  const txt = formatearReporte(construirReporte(divergente));
  assert.match(txt, /#\s+WI\s+TIPO\s+SCRIPT\s+ACCION/);
  assert.match(txt, /QUE LE FALTA A CADA UNO/);
  assert.match(txt, /Ana Maria Gonzalez\s+·\s+\d+ pendiente/);
});

test('el formato nunca imprime credenciales', () => {
  const txt = formatearReporte(construirReporte(base));
  assert.equal(/password|Pwd=|AZURE_PAT|User ID/i.test(txt), false);
});

test('el formato declara que produccion no se midio', () => {
  const txt = formatearReporte(construirReporte(base));
  assert.match(txt, /produccion/i);
});

test('accionDe(D13) dice que revisar y en que ambiente corrio', () => {
  const a = accionDe({ codigo: 'D13', titulo: 'Pausado pero corrio en dev, stage', corrioEn: ['dev', 'stage'] });
  assert.match(a, /^Revisar/);
  assert.match(a, /pausado/);
  assert.match(a, /dev, stage/);
});
