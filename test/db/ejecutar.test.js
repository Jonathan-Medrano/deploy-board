import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGOS, credenciales, credencialesDelWebConfig, medirAmbiente, parsearSalida, argsDeSqlcmd } from '../../src/db/ejecutar.js';

test('produccion NO es un ambiente conectable', () => {
  assert.equal('produccion' in CATALOGOS, false);
});

test('medir produccion tira error, no intenta conectarse', async () => {
  await assert.rejects(() => medirAmbiente([], 'produccion', { correr: () => { throw new Error('no'); } }), /produccion/i);
});

test('sin credenciales el error dice que falta el .env y no filtra nada', () => {
  assert.throws(
    () => credenciales({ SQL_SERVER: '', SQL_USER: '', SQL_PASSWORD: '' }, { leerWebConfig: () => null }),
    /\.env/
  );
});

test('las variables de entorno GANAN sobre el Web.config', () => {
  const c = credenciales(
    { SQL_SERVER: 's', SQL_USER: 'u', SQL_PASSWORD: 'p' },
    { leerWebConfig: () => { throw new Error('no deberia mirar el Web.config'); } }
  );
  assert.deepEqual(c, { server: 's', user: 'u', pass: 'p' });
});

test('sin variables, saca la conexion del Web.config', () => {
  const xml = '<add name="x" connectionString="Data Source=SRV;Initial Catalog=dev_fidel_db;User ID=lector;Password=secreta" />';
  const c = credenciales({}, { leerWebConfig: (r, d) => credencialesDelWebConfig(r, { leer: () => xml }) });
  assert.equal(c.server, 'SRV');
  assert.equal(c.user, 'lector');
});

test('un Web.config sin connectionString no inventa credenciales: tira con un mensaje util', () => {
  assert.throws(
    () => credenciales({}, { leerWebConfig: () => null }),
    /Completa el .env o revisa API_NET_DIR/
  );
});

test('el mensaje de error no filtra ningun valor de credencial', () => {
  try {
    credenciales({ SQL_SERVER: 'SRV', SQL_USER: 'lector', SQL_PASSWORD: 'SUPERSECRETA' }, { leerWebConfig: () => null });
  } catch (e) {
    assert.equal(/SUPERSECRETA/.test(e.message), false);
  }
  const e2 = (() => { try { credenciales({}, { leerWebConfig: () => null }); } catch (x) { return x; } })();
  assert.equal(/Password|Pwd|User ID/.test(e2.message), false);
});

test('parsearSalida lee la salida REAL de sqlcmd, que viene con CRLF', () => {
  assert.deepEqual(parsearSalida('s0SI\r\ns1NO\r\n'), { s0: 'SI', s1: 'NO' });
});

test('parsearSalida lee el par sonda/valor de sqlcmd', () => {
  assert.deepEqual(parsearSalida('s0SI\ns1NO\n'), { s0: 'SI', s1: 'NO' });
});

test('mide un script y devuelve su veredicto', async () => {
  const scripts = [{ id: 'a', sondas: [{ id: 's0', tipo: 'columna', tabla: 'P', columna: 'c' }] }];
  const r = await medirAmbiente(scripts, 'dev', {
    cred: { server: 's', user: 'u', pass: 'p' },
    correr: () => 's0SI\n',
  });
  assert.equal(r.a.estado, 'OK');
});

test('un script sin sonda consultable queda en ? sin tocar la base', async () => {
  let llamadas = 0;
  const scripts = [{ id: 'a', sondas: [{ id: 's0', tipo: 'sin_sonda', detalle: 'nada derivable' }] }];
  const r = await medirAmbiente(scripts, 'dev', {
    cred: { server: 's', user: 'u', pass: 'p' },
    correr: () => { llamadas++; return ''; },
  });
  assert.equal(r.a.estado, '?');
  assert.equal(llamadas, 0);
});

test('una sonda invalida deja ESE script en ? y no tumba la medicion de los demas', async () => {
  const scripts = [
    { id: 'malo', sondas: [{ id: 's0', tipo: 'fila', tabla: 'T] DROP TABLE Usuario --', columna: 'Name', valor: "'x'" }] },
    { id: 'bueno', sondas: [{ id: 's0', tipo: 'tabla', tabla: 'Producto' }] },
  ];
  const r = await medirAmbiente(scripts, 'dev', {
    cred: { server: 's', user: 'u', pass: 'p' },
    correr: () => 's0SI\n',
  });
  assert.equal(r.malo.estado, '?');
  assert.match(r.malo.nota, /identificador SQL simple/);
  assert.equal(r.bueno.estado, 'OK', 'un script invalido no puede perder la medicion de los otros');
});

// Medido contra dev el 2026-09-22: sqlcmd RECHAZA `-h` junto con `-y` y tambien `-W` junto
// con `-y`. Con `-y 0` solo, la salida ya arranca en el cuerpo del modulo. Este test clava
// que nadie vuelva a "mejorarlo" agregando banderas que tumban la consulta entera.
test('la consulta de definicion lleva -y 0 SOLO: sqlcmd rechaza -h y -W junto con -y', () => {
  const cred = { server: 's', user: 'u', pass: 'p' };
  const largo = argsDeSqlcmd(cred, 'dev_fidel_db', 'SELECT 1', { textoLargo: true });
  assert.ok(largo.includes('-y'));
  assert.equal(largo.includes('-h'), false, 'sqlcmd: "The -h and the -y 0 options are mutually exclusive"');
  assert.equal(largo.includes('-W'), false, 'sqlcmd: "The -W and the -y/-Y options are mutually exclusive"');

  const corto = argsDeSqlcmd(cred, 'dev_fidel_db', 'SELECT 1', {});
  assert.ok(corto.includes('-h') && corto.includes('-W'), 'la consulta de si/no si los lleva');
  assert.equal(corto.includes('-y'), false);
});

test('si sqlcmd falla, el script queda en ? con el motivo, no en OK', async () => {
  const scripts = [{ id: 'a', sondas: [{ id: 's0', tipo: 'tabla', tabla: 'P' }] }];
  const r = await medirAmbiente(scripts, 'dev', {
    cred: { server: 's', user: 'u', pass: 'p' },
    correr: () => { throw new Error('sqlcmd exploto'); },
  });
  assert.equal(r.a.estado, '?');
  assert.match(r.a.nota, /sqlcmd/);
});
