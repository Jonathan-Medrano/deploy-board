import test from 'node:test';
import assert from 'node:assert/strict';
import { rutaSegura, crearManejador, TIPOS_MIME, opcionesPedidas } from '../src/servidor.js';

test('una ruta normal se resuelve dentro de web/', () => {
  assert.equal(rutaSegura('/web/app.js'), 'app.js');
  assert.equal(rutaSegura('/'), 'index.html');
});

test('subir de carpeta con .. se rechaza: web/ no puede servir el .env de al lado', () => {
  assert.equal(rutaSegura('/web/../../.env'), null);
  assert.equal(rutaSegura('/web/..%2f..%2f.env'), null);
});

test('una barra invertida tampoco sube de carpeta en Windows', () => {
  assert.equal(rutaSegura('/web/..'+String.fromCharCode(92)+'.env'), null);
});

test('el query string no forma parte del archivo pedido', () => {
  assert.equal(rutaSegura('/web/app.js?v=3'), 'app.js');
});

test('cada extension servida tiene su tipo declarado', () => {
  for (const e of ['.html', '.css', '.js', '.json']) assert.ok(TIPOS_MIME[e], `falta ${e}`);
});

function almacenFalso(inicial = { marcas: {}, ignorados: {} }, vista = null) {
  let m = inicial, v = vista;
  return {
    rutas: { dir: 'X', marcas: 'X/marcas.json', vista: 'X/vista.json' },
    leerMarcas: () => m, guardarMarcas: (x) => { m = x; },
    leerVista: () => v, guardarVista: (x) => { v = x; },
  };
}

const opcionesBase = { iteracion: 'I', sprint: 'S', ambientes: ['dev', 'stage'], destino: 'stage' };

test('ping contesta sin tocar ADO ni las bases', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => { throw new Error('no'); }, opciones: opcionesBase });
  const r = await man({ metodo: 'GET', ruta: '/api/ping' });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.cuerpo).ok, true);
});

test('sin medicion previa el tablero dice que no hay datos en vez de mostrar una lista vacia', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase });
  const r = await man({ metodo: 'GET', ruta: '/api/vista' });
  assert.equal(r.status, 200);
  const b = JSON.parse(r.cuerpo);
  assert.equal(b.vista, null);
  assert.equal(b.nuncaSeMidio, true);
});

test('la vista guardada vuelve junto con las marcas, en una sola lectura', async () => {
  const alm = almacenFalso({ marcas: { a: { subidoAMain: true } }, ignorados: {} }, { meta: { total: 3 }, filas: [] });
  const man = crearManejador({ almacen: alm, medir: async () => ({}), opciones: opcionesBase });
  const b = JSON.parse((await man({ metodo: 'GET', ruta: '/api/vista' })).cuerpo);
  assert.equal(b.vista.meta.total, 3);
  assert.equal(b.marcas.marcas.a.subidoAMain, true);
});

test('medir guarda la vista nueva y la devuelve', async () => {
  const alm = almacenFalso();
  let llamadas = 0;
  const man = crearManejador({
    almacen: alm,
    medir: async () => { llamadas++; return { vista: { meta: { total: 7 }, filas: [] }, avisos: ['ojo'] }; },
    opciones: opcionesBase,
  });
  const r = await man({ metodo: 'POST', ruta: '/api/medir' });
  assert.equal(r.status, 200);
  assert.equal(llamadas, 1);
  assert.equal(JSON.parse(r.cuerpo).vista.meta.total, 7);
  assert.equal(alm.leerVista().meta.total, 7);
});

test('si medir falla, la medicion anterior NO se pisa con un error', async () => {
  const alm = almacenFalso({ marcas: {}, ignorados: {} }, { meta: { total: 3 }, filas: [] });
  const man = crearManejador({ almacen: alm, medir: async () => { throw new Error('sqlcmd no esta'); }, opciones: opcionesBase });
  const r = await man({ metodo: 'POST', ruta: '/api/medir' });
  assert.equal(r.status, 500);
  assert.match(JSON.parse(r.cuerpo).error, /sqlcmd/);
  assert.equal(alm.leerVista().meta.total, 3);
});

test('marcar escribe en el almacen y devuelve el estado completo', async () => {
  const alm = almacenFalso();
  const man = crearManejador({ almacen: alm, medir: async () => ({}), opciones: opcionesBase, quien: 'Ana', hoy: () => '2026-09-22' });
  const r = await man({ metodo: 'POST', ruta: '/api/marcas', cuerpo: JSON.stringify({ tipo: 'marca', id: 'a', poner: true }) });
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.cuerpo).marcas.a, { subidoAMain: true, fecha: '2026-09-22', por: 'Ana' });
  assert.equal(alm.leerMarcas().marcas.a.subidoAMain, true);
});

test('un cuerpo invalido devuelve 400 y no escribe nada', async () => {
  const alm = almacenFalso();
  let guardo = false;
  alm.guardarMarcas = () => { guardo = true; };
  const man = crearManejador({ almacen: alm, medir: async () => ({}), opciones: opcionesBase });
  const r = await man({ metodo: 'POST', ruta: '/api/marcas', cuerpo: '{no json' });
  assert.equal(r.status, 400);
  assert.equal(guardo, false);
});

test('un tipo de marca inexistente devuelve 400, no 500', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase });
  const r = await man({ metodo: 'POST', ruta: '/api/marcas', cuerpo: JSON.stringify({ tipo: 'x', id: 'a', poner: true }) });
  assert.equal(r.status, 400);
});

test('una ruta desconocida da 404 y no cae en el archivo index', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase });
  const r = await man({ metodo: 'GET', ruta: '/api/loquesea' });
  assert.equal(r.status, 404);
});

test('la configuracion que ve la pantalla no incluye credenciales', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase, quien: 'Ana' });
  const b = JSON.parse((await man({ metodo: 'GET', ruta: '/api/config' })).cuerpo);
  assert.equal(b.quien, 'Ana');
  assert.equal(b.opciones.sprint, 'S');
  assert.equal(JSON.stringify(b).toLowerCase().includes('pat'), false);
  assert.equal(JSON.stringify(b).toLowerCase().includes('password'), false);
});

test('el tablero puede preguntar si hay una version nueva sin traerla', async () => {
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    actualizador: { estado: () => ({ hayCambios: true, detras: 2, adelante: 0, commit: 'abc', nota: null }), traer: () => { throw new Error('no debia traer'); } },
  });
  const b = JSON.parse((await man({ metodo: 'GET', ruta: '/api/actualizaciones' })).cuerpo);
  assert.equal(b.hayCambios, true);
  assert.equal(b.detras, 2);
});

test('traer cambios que mueven el commit pide reiniciar y avisa al arrancador', async () => {
  let pidioReinicio = false;
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    actualizador: { estado: () => ({}), traer: () => ({ ok: true, reiniciar: true, mensaje: 'Updating abc..def' }) },
    alReiniciar: () => { pidioReinicio = true; },
  });
  const r = await man({ metodo: 'POST', ruta: '/api/actualizar' });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.cuerpo).reiniciar, true);
  assert.equal(pidioReinicio, true);
});

test('un pull que ya estaba al dia NO reinicia el sistema por las dudas', async () => {
  let pidioReinicio = false;
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    actualizador: { estado: () => ({}), traer: () => ({ ok: true, reiniciar: false, mensaje: 'Ya estaba al dia.' }) },
    alReiniciar: () => { pidioReinicio = true; },
  });
  await man({ metodo: 'POST', ruta: '/api/actualizar' });
  assert.equal(pidioReinicio, false);
});

test('un pull rechazado por trabajo local devuelve 409 y NO reinicia', async () => {
  let pidioReinicio = false;
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    actualizador: { estado: () => ({}), traer: () => ({ ok: false, reiniciar: false, mensaje: 'Not possible to fast-forward' }) },
    alReiniciar: () => { pidioReinicio = true; },
  });
  const r = await man({ metodo: 'POST', ruta: '/api/actualizar' });
  assert.equal(r.status, 409);
  assert.match(JSON.parse(r.cuerpo).error, /fast-forward/);
  assert.equal(pidioReinicio, false);
});

test('el tablero puede pedir la lista de sprints para el selector', async () => {
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    listarSprints: async () => ({ iteraciones: [{ nombre: 'X', ruta: 'r', carpeta: 'Sprint_X' }], carpetas: ['Sprint_X'] }),
  });
  const b = JSON.parse((await man({ metodo: 'GET', ruta: '/api/sprints' })).cuerpo);
  assert.equal(b.iteraciones[0].carpeta, 'Sprint_X');
});

test('si Azure no contesta la lista de sprints, se dice; no se devuelve una lista vacia', async () => {
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    listarSprints: async () => { throw new Error('401'); },
  });
  const r = await man({ metodo: 'GET', ruta: '/api/sprints' });
  assert.equal(r.status, 500);
  assert.match(JSON.parse(r.cuerpo).error, /401/);
});

test('el sprint elegido en pantalla llega a la medicion', async () => {
  let recibido = null;
  const man = crearManejador({
    almacen: almacenFalso(), opciones: opcionesBase,
    medir: async (e) => { recibido = e; return { vista: { meta: {} }, avisos: [] }; },
  });
  await man({ metodo: 'POST', ruta: '/api/medir', cuerpo: JSON.stringify({ iteracion: 'It', sprint: 'Sprint_Z' }) });
  assert.deepEqual(recibido, { iteracion: 'It', sprint: 'Sprint_Z' });
});

test('medir sin elegir nada sigue funcionando con lo configurado', async () => {
  let recibido = 'no llamado';
  const man = crearManejador({
    almacen: almacenFalso(), opciones: opcionesBase,
    medir: async (e) => { recibido = e; return { vista: { meta: {} }, avisos: [] }; },
  });
  const r = await man({ metodo: 'POST', ruta: '/api/medir' });
  assert.equal(r.status, 200);
  assert.deepEqual(recibido, {});
});

test('un cuerpo roto en medir da 400 y no dispara una medicion de veinte segundos', async () => {
  let midio = false;
  const man = crearManejador({
    almacen: almacenFalso(), opciones: opcionesBase,
    medir: async () => { midio = true; return { vista: {}, avisos: [] }; },
  });
  const r = await man({ metodo: 'POST', ruta: '/api/medir', cuerpo: '{roto' });
  assert.equal(r.status, 400);
  assert.equal(midio, false);
});

test('elegir "sin carpeta" en pantalla NO cae a la carpeta del .env', () => {
  const r = opcionesPedidas({ iteracion: 'I', sprint: 'Sprint_2026_09_02' }, { iteracion: 'Oct', sprint: null });
  assert.equal(r.sprint, null);
  assert.equal(r.iteracion, 'Oct');
});

test('una carpeta vacia tambien significa sin carpeta', () => {
  assert.equal(opcionesPedidas({ sprint: 'S' }, { sprint: '' }).sprint, null);
});

test('si la pantalla no dice nada de la carpeta, manda la del .env', () => {
  assert.equal(opcionesPedidas({ sprint: 'S' }, {}).sprint, 'S');
  assert.equal(opcionesPedidas({ sprint: 'S' }, { iteracion: 'X' }).sprint, 'S');
});
