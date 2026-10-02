import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rutaSegura, crearManejador, TIPOS_MIME, opcionesPedidas } from '../src/servidor.js';
import { crearAlmacen } from '../src/almacen.js';

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

function almacenFalso(inicial = { version: 0, sprints: {} }, vista = null) {
  let m = inicial, v = vista;
  return {
    rutas: { dir: 'X', decisiones: 'X/decisiones.json', vista: 'X/vista.json' },
    leerDecisiones: () => m, guardarDecisiones: (x) => { m = { ...x, version: m.version + 1 }; return m; },
    hayMarcasViejas: () => false,
    leerVista: () => v, guardarVista: (x) => { v = x; },
  };
}

const opcionesBase = { iteracion: 'I', sprint: 'S', ambientes: ['dev', 'stage'], destino: 'stage' };

test('ping contesta sin tocar ADO ni las bases', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => { throw new Error('no'); }, opciones: opcionesBase });
  const r = await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/ping' });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.cuerpo).ok, true);
});

test('sin medicion previa el tablero dice que no hay datos en vez de mostrar una lista vacia', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase });
  const r = await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/vista' });
  assert.equal(r.status, 200);
  const b = JSON.parse(r.cuerpo);
  assert.equal(b.vista, null);
  assert.equal(b.nuncaSeMidio, true);
});

test('medir guarda la vista nueva y la devuelve', async () => {
  const alm = almacenFalso();
  let llamadas = 0;
  const man = crearManejador({
    almacen: alm,
    medir: async () => { llamadas++; return { vista: { meta: { total: 7 }, filas: [] }, avisos: ['ojo'] }; },
    opciones: opcionesBase,
  });
  const r = await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/medir' });
  assert.equal(r.status, 200);
  assert.equal(llamadas, 1);
  assert.equal(JSON.parse(r.cuerpo).vista.meta.total, 7);
  assert.equal(alm.leerVista().meta.total, 7);
});

test('si medir falla, la medicion anterior NO se pisa con un error', async () => {
  const alm = almacenFalso(undefined, { meta: { total: 3 }, filas: [] });
  const man = crearManejador({ almacen: alm, medir: async () => { throw new Error('sqlcmd no esta'); }, opciones: opcionesBase });
  const r = await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/medir' });
  assert.equal(r.status, 500);
  assert.match(JSON.parse(r.cuerpo).error, /sqlcmd/);
  assert.equal(alm.leerVista().meta.total, 3);
});

test('una ruta desconocida da 404 y no cae en el archivo index', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase });
  const r = await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/loquesea' });
  assert.equal(r.status, 404);
});

test('la configuracion que ve la pantalla no incluye credenciales', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase, quien: 'Ana' });
  const b = JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/config' })).cuerpo);
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
  const b = JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/actualizaciones' })).cuerpo);
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
  const r = await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/actualizar' });
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
  await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/actualizar' });
  assert.equal(pidioReinicio, false);
});

test('un pull rechazado por trabajo local devuelve 409 y NO reinicia', async () => {
  let pidioReinicio = false;
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    actualizador: { estado: () => ({}), traer: () => ({ ok: false, reiniciar: false, mensaje: 'Not possible to fast-forward' }) },
    alReiniciar: () => { pidioReinicio = true; },
  });
  const r = await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/actualizar' });
  assert.equal(r.status, 409);
  assert.match(JSON.parse(r.cuerpo).error, /fast-forward/);
  assert.equal(pidioReinicio, false);
});

test('el tablero puede pedir la lista de sprints para el selector', async () => {
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    listarSprints: async () => ({ iteraciones: [{ nombre: 'X', ruta: 'r', carpeta: 'Sprint_X' }], carpetas: ['Sprint_X'] }),
  });
  const b = JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/sprints' })).cuerpo);
  assert.equal(b.iteraciones[0].carpeta, 'Sprint_X');
});

test('si Azure no contesta la lista de sprints, se dice; no se devuelve una lista vacia', async () => {
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase,
    listarSprints: async () => { throw new Error('401'); },
  });
  const r = await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/sprints' });
  assert.equal(r.status, 500);
  assert.match(JSON.parse(r.cuerpo).error, /401/);
});

test('el sprint elegido en pantalla llega a la medicion', async () => {
  let recibido = null;
  const man = crearManejador({
    almacen: almacenFalso(), opciones: opcionesBase,
    medir: async (e) => { recibido = e; return { vista: { meta: {} }, avisos: [] }; },
  });
  await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/medir', cuerpo: JSON.stringify({ iteracion: 'It', sprint: 'Sprint_Z' }) });
  assert.deepEqual(recibido, { iteracion: 'It', sprint: 'Sprint_Z' });
});

test('medir sin elegir nada sigue funcionando con lo configurado', async () => {
  let recibido = 'no llamado';
  const man = crearManejador({
    almacen: almacenFalso(), opciones: opcionesBase,
    medir: async (e) => { recibido = e; return { vista: { meta: {} }, avisos: [] }; },
  });
  const r = await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/medir' });
  assert.equal(r.status, 200);
  assert.deepEqual(recibido, {});
});

test('un cuerpo roto en medir da 400 y no dispara una medicion de veinte segundos', async () => {
  let midio = false;
  const man = crearManejador({
    almacen: almacenFalso(), opciones: opcionesBase,
    medir: async () => { midio = true; return { vista: {}, avisos: [] }; },
  });
  const r = await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/medir', cuerpo: '{roto' });
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

function conAlmacenReal(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-board-srv-'));
  const alm = crearAlmacen({ DEPLOY_BOARD_ESTADO: dir });
  const man = crearManejador({ almacen: alm, medir: async () => ({}), opciones: opcionesBase, quien: 'Ana', hoy: () => '2026-09-25' });
  return Promise.resolve(fn(man, alm, dir)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}


test('la vista se pide por sprint en el query string', () => conAlmacenReal(async (man, alm) => {
  alm.guardarVista({ meta: { sprint: 'Sprint_A', medido: '2026-09-25T10:00:00Z', total: 1 } });
  alm.guardarVista({ meta: { sprint: 'Sprint_B', medido: '2026-09-25T11:00:00Z', total: 2 } });
  const a = JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/vista?sprint=Sprint_A' })).cuerpo);
  assert.equal(a.vista.meta.total, 1);
  const z = JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/vista?sprint=Sprint_Z' })).cuerpo);
  assert.equal(z.nuncaSeMidio, true);
}));

test('el .. de la URL no llega nunca a pedir un archivo, aunque la API ahora parsee la URL', async () => {
  const pedidos = [];
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase, leerEstatico: (r) => { pedidos.push(r); return null; } });
  for (const u of ['/web/../../.env', '/..%2f.env', '/web/%2e%2e/.env']) {
    assert.equal((await man({ host: 'localhost:4700', metodo: 'GET', ruta: u })).status, 404);
  }
  assert.deepEqual(pedidos, []);
});

const VISTA = {
  meta: { sprint: 'S', medido: '2026-09-25T10:00:00Z' },
  filas: [{ id: 's1', hash: 'h1' }, { id: 's2', hash: 'h2' }],
  desvios: [{ codigo: 'D2', severidad: 'bloqueante', titulo: 'T', detalle: 'a', scriptId: 's1', wiId: 1, responsable: 'Ana', firma: 'f1' }],
  personas: [], revisar: [],
};
const decidir = (man, cuerpo) => man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/decisiones', cuerpo: JSON.stringify(cuerpo) });
const conVista = (fn) => conAlmacenReal(async (man, alm, dir) => { alm.guardarVista(VISTA); return fn(man, alm, dir); });

test('la vista llega con las decisiones aplicadas y la version para guardar', () => conVista(async (man) => {
  const b = JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/vista?sprint=S' })).cuerpo);
  assert.equal(b.version, 0);
  assert.equal(b.vista.meta.bloqueantes, 1);
  assert.equal(b.vista.desvios[0].estado, 'abierto');
}));

test('aceptar un desvio con motivo lo guarda con autor y fecha y devuelve la vista recalculada', () => conVista(async (man, alm) => {
  const r = await decidir(man, { sprint: 'S', tipo: 'aceptado', clave: 'f1', poner: true, motivo: 'se corre a mano', version: 0 });
  assert.equal(r.status, 200);
  const b = JSON.parse(r.cuerpo);
  assert.equal(b.version, 1);
  assert.equal(b.vista.meta.bloqueantes, 0);
  assert.deepEqual(alm.leerDecisiones().sprints.S.aceptados.f1, { codigo: 'D2', por: 'Ana', fecha: '2026-09-25', motivo: 'se corre a mano' });
}));

test('aceptar sin motivo da 400 y no guarda', () => conVista(async (man, alm) => {
  const r = await decidir(man, { sprint: 'S', tipo: 'aceptado', clave: 'f1', poner: true, motivo: '', version: 0 });
  assert.equal(r.status, 400);
  assert.equal(alm.leerDecisiones().version, 0);
}));

test('el hash de una marca lo pone el servidor desde la medicion, no la pantalla', () => conVista(async (man, alm) => {
  await decidir(man, { sprint: 'S', tipo: 'marca', clave: 's1', poner: true, hash: 'inventado', version: 0 });
  assert.equal(alm.leerDecisiones().sprints.S.marcas.s1.hash, 'h1');
}));

test('decidir sobre un script o un desvio que la medicion no tiene da 400', () => conVista(async (man) => {
  assert.equal((await decidir(man, { sprint: 'S', tipo: 'marca', clave: 'zz', poner: true, version: 0 })).status, 400);
  assert.equal((await decidir(man, { sprint: 'S', tipo: 'aceptado', clave: 'fz', poner: true, motivo: 'x', version: 0 })).status, 400);
}));

test('decidir sobre un sprint sin medir da 409: primero hay que medirlo', () => conVista(async (man) => {
  const r = await decidir(man, { sprint: 'OTRO', tipo: 'marca', clave: 's1', poner: true, version: 0 });
  assert.equal(r.status, 409);
}));

test('sacar una decision no exige que el script siga en la medicion: si no, una marca huerfana no se borraria nunca', () => conVista(async (man, alm) => {
  alm.guardarDecisiones({ sprints: { S: { marcas: { viejo: { hash: 'x' } } } } }, 0);
  const r = await decidir(man, { sprint: 'S', tipo: 'marca', clave: 'viejo', poner: false, version: 1 });
  assert.equal(r.status, 200);
  assert.equal(alm.leerDecisiones().sprints.S.marcas.viejo, undefined);
}));

test('una medicion de antes de los hashes no se puede marcar: la marca quedaria atada a nada', () => conAlmacenReal(async (man, alm) => {
  alm.guardarVista({ ...VISTA, filas: [{ id: 's1' }] });
  const r = await decidir(man, { sprint: 'S', tipo: 'marca', clave: 's1', poner: true, version: 0 });
  assert.equal(r.status, 409);
  assert.match(JSON.parse(r.cuerpo).error, /medi/i);
}));

test('decidir sin version da 400', () => conVista(async (man) => {
  assert.equal((await decidir(man, { sprint: 'S', tipo: 'marca', clave: 's1', poner: true })).status, 400);
}));

test('un cuerpo invalido al decidir da 400 y no escribe nada', () => conVista(async (man, alm) => {
  const r = await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/decisiones', cuerpo: '{no json' });
  assert.equal(r.status, 400);
  assert.equal(alm.leerDecisiones().version, 0);
}));

test('decidir con una version vieja da 409 con la vista y la version de ahora, sin pisar lo del otro', () => conVista(async (man, alm) => {
  await decidir(man, { sprint: 'S', tipo: 'marca', clave: 's1', poner: true, version: 0 });
  const r = await decidir(man, { sprint: 'S', tipo: 'marca', clave: 's2', poner: true, version: 0 });
  assert.equal(r.status, 409);
  const b = JSON.parse(r.cuerpo);
  assert.equal(b.motivo, 'version');
  assert.equal(b.version, 1);
  assert.equal(b.vista.filas.find((f) => f.id === 's1').marca.hash, 'h1');
  assert.equal(alm.leerDecisiones().sprints.S.marcas.s2, undefined);
}));

test('con decisiones.json danado, decidir da 409 y el archivo queda intacto', () => conVista(async (man, alm, dir) => {
  fs.writeFileSync(path.join(dir, 'decisiones.json'), '{"sprints"');
  const r = await decidir(man, { sprint: 'S', tipo: 'marca', clave: 's1', poner: true, version: 0 });
  assert.equal(r.status, 409);
  assert.equal(JSON.parse(r.cuerpo).motivo, 'danado');
  assert.equal(fs.readFileSync(path.join(dir, 'decisiones.json'), 'utf8'), '{"sprints"');
}));

test('con decisiones.json danado la vista igual se ve, sin decisiones y avisando', () => conVista(async (man, alm, dir) => {
  fs.writeFileSync(path.join(dir, 'decisiones.json'), '{"sprints"');
  const b = JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/vista' })).cuerpo);
  assert.equal(b.decisionesDanadas, true);
  assert.equal(b.version, null);
  assert.equal(b.vista.meta.bloqueantes, 1);
}));

test('la ruta vieja de marcas ya no existe', () => conVista(async (man) => {
  assert.equal((await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/marcas', cuerpo: '{}' })).status, 404);
}));

test('si queda un marcas.json viejo, la vista lo avisa', () => conVista(async (man, alm, dir) => {
  fs.writeFileSync(path.join(dir, 'marcas.json'), '{}');
  assert.equal(JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/vista' })).cuerpo).hayMarcasViejas, true);
}));

test('medir de nuevo el mismo sprint guarda como resueltos los desvios que desaparecieron', () => conAlmacenReal(async (man0, alm) => {
  alm.guardarVista(VISTA);
  const sinD2 = { ...VISTA, meta: { ...VISTA.meta, medido: '2026-09-25T12:00:00Z' }, desvios: [] };
  const man = crearManejador({ almacen: alm, medir: async () => ({ vista: sinD2, avisos: [] }), opciones: opcionesBase });
  const b = JSON.parse((await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/medir' })).cuerpo);
  assert.deepEqual(b.vista.resueltos.map((d) => d.codigo), ['D2']);
  const guardada = JSON.parse((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/vista?sprint=S' })).cuerpo);
  assert.equal(guardada.vista.resueltos.length, 1);
}));

test('guardar una decision lo anuncia en la consola con el desvio y el motivo, no con la firma', () => conAlmacenReal(async (_m, alm) => {
  alm.guardarVista(VISTA);
  const lineas = [];
  const progreso = { ok: (t) => lineas.push(t), aviso: (t) => lineas.push(t) };
  const man = crearManejador({ almacen: alm, medir: async () => ({}), opciones: opcionesBase, quien: 'Ana', hoy: () => 'f', progreso });
  await decidir(man, { sprint: 'S', tipo: 'aceptado', clave: 'f1', poner: true, motivo: 'se corre a mano', version: 0 });
  assert.deepEqual(lineas, ['Ana acepto el desvio: D2 T (se corre a mano)']);
}));

test('un Host ajeno (DNS rebinding) no lee nada, ni la vista ni la configuracion', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase });
  for (const host of ['atacante.com:4700', 'localhost:9999', undefined]) {
    for (const ruta of ['/api/vista', '/api/config', '/']) {
      const r = await man({ host, metodo: 'GET', ruta });
      assert.equal(r.status, 403, `${host} ${ruta}`);
    }
  }
});

test('un POST desde otra pagina no mide, no actualiza y no decide', async () => {
  let midio = false, trajo = false;
  const man = crearManejador({
    almacen: almacenFalso(), medir: async () => { midio = true; return {}; }, opciones: opcionesBase,
    actualizador: { estado: () => ({}), traer: () => { trajo = true; return { ok: true }; } },
  });
  for (const ruta of ['/api/medir', '/api/actualizar', '/api/decisiones']) {
    const r = await man({ host: 'localhost:4700', origen: 'https://atacante.com', metodo: 'POST', ruta, cuerpo: '{}' });
    assert.equal(r.status, 403, ruta);
  }
  const nulo = await man({ host: 'localhost:4700', origen: 'null', metodo: 'POST', ruta: '/api/actualizar' });
  assert.equal(nulo.status, 403, 'un iframe sandbox manda Origin: null');
  assert.equal(midio || trajo, false);
});

test('la propia pantalla y el ping del .bat pasan, por localhost o por 127.0.0.1', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase, actualizador: { estado: () => ({}), traer: () => ({ ok: true }) } });
  assert.equal((await man({ host: '127.0.0.1:4700', metodo: 'GET', ruta: '/api/ping' })).status, 200);
  assert.equal((await man({ host: 'localhost:4700', origen: 'http://localhost:4700', metodo: 'POST', ruta: '/api/actualizar' })).status, 200);
  assert.equal((await man({ host: 'localhost:4700', metodo: 'POST', ruta: '/api/actualizar' })).status, 200, 'sin Origin no hay navegador de por medio');
});

test('con DEPLOY_BOARD_PORT cambiado, el Host propio es el del puerto nuevo', async () => {
  const man = crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase, puerto: 4800 });
  assert.equal((await man({ host: 'localhost:4800', metodo: 'GET', ruta: '/api/ping' })).status, 200);
  assert.equal((await man({ host: 'localhost:4700', metodo: 'GET', ruta: '/api/ping' })).status, 403);
});

test('el link del PR elegido en pantalla viaja a la medicion', () => {
  assert.equal(opcionesPedidas({}, { prUrl: ' https://x/_git/Api.Net/pullrequest/1 ' }).prUrl, 'https://x/_git/Api.Net/pullrequest/1');
  assert.equal(opcionesPedidas({}, {}).prUrl, undefined);
});

function manRepos(repos) {
  return crearManejador({ almacen: almacenFalso(), medir: async () => ({}), opciones: opcionesBase, quien: 'Jona', repos });
}
const post = (ruta, cuerpo) => ({ host: 'localhost:4700', metodo: 'POST', ruta, cuerpo: JSON.stringify(cuerpo) });

test('medir repos con un par invalido: 400 sin llamar a Azure', async () => {
  const man = manRepos({ medir: async () => { throw new Error('no deberia medir'); } });
  const r = await man(post('/api/repos/medir', { par: 'main-dev' }));
  assert.equal(r.status, 400);
});

test('medir repos devuelve el par, la hora y las filas', async () => {
  const man = manRepos({ medir: async (par) => [{ repo: 'Api.Net', par }] });
  const r = await man(post('/api/repos/medir', { par: 'stage-main' }));
  assert.equal(r.status, 200);
  const b = JSON.parse(r.cuerpo);
  assert.equal(b.par, 'stage-main');
  assert.ok(b.medido);
  assert.deepEqual(b.repos, [{ repo: 'Api.Net', par: 'stage-main' }]);
});

test('crear PR usa el par del pedido y el nombre de quien esta en el panel', async () => {
  let recibido = null;
  const man = manRepos({ crearPr: async (d) => { recibido = d; return { id: 1, link: 'L', titulo: 'DevToStage' }; } });
  const r = await man(post('/api/repos/crear-pr', { repo: 'Api.Net', par: 'dev-stage' }));
  assert.equal(r.status, 200);
  assert.deepEqual(recibido, { repo: 'Api.Net', par: 'dev-stage', quien: 'Jona' });
  assert.deepEqual(JSON.parse(r.cuerpo), { id: 1, link: 'L', titulo: 'DevToStage' });
});

test('crear PR con uno activo devuelve 409 y el link del existente', async () => {
  const man = manRepos({ crearPr: async () => { throw Object.assign(new Error('Ya hay un PR activo'), { status: 409, link: 'L9' }); } });
  const r = await man(post('/api/repos/crear-pr', { repo: 'R', par: 'stage-main' }));
  assert.equal(r.status, 409);
  assert.deepEqual(JSON.parse(r.cuerpo), { error: 'Ya hay un PR activo', link: 'L9' });
});

test('crear PR sin repo o con par invalido: 400', async () => {
  const man = manRepos({ crearPr: async () => { throw new Error('no'); } });
  assert.equal((await man(post('/api/repos/crear-pr', { par: 'stage-main' }))).status, 400);
  assert.equal((await man(post('/api/repos/crear-pr', { repo: 'R', par: 'x' }))).status, 400);
});

test('crear PR desde otra pagina se rechaza como cualquier POST', async () => {
  const man = manRepos({ crearPr: async () => { throw new Error('no deberia crear'); } });
  const r = await man({ ...post('/api/repos/crear-pr', { repo: 'R', par: 'stage-main' }), origen: 'http://malo.com' });
  assert.equal(r.status, 403);
});
