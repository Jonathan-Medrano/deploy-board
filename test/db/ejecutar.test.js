import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGOS, credenciales, medirAmbiente, parsearSalida, argsDeSqlcmd } from '../../src/db/ejecutar.js';

test('produccion NO es un ambiente conectable', () => {
  assert.equal('produccion' in CATALOGOS, false);
});

test('medir produccion tira error, no intenta conectarse', async () => {
  await assert.rejects(() => medirAmbiente([], 'produccion', { correr: () => { throw new Error('no'); } }), /produccion/i);
});

test('sin credenciales el error dice que falta el .env y no filtra nada', () => {
  assert.throws(() => credenciales({ SQL_SERVER: '', SQL_USER: '', SQL_PASSWORD: '' }), /deploy-board\/\.env/);
});

test('las credenciales salen del .env', () => {
  assert.deepEqual(credenciales({ SQL_SERVER: 's', SQL_USER: 'u', SQL_PASSWORD: 'p' }), { server: 's', user: 'u', pass: 'p' });
});

test('sin SQL_* no se busca un Web.config de Api.Net: tira aunque API_NET_DIR o WEB_CONFIG esten puestos', () => {
  assert.throws(() => credenciales({ API_NET_DIR: '../Api.Net', WEB_CONFIG: 'Web.config' }), /SQL_SERVER/);
});

test('el mensaje de error no filtra ningun valor de credencial', () => {
  const e = (() => { try { credenciales({ SQL_SERVER: 'SRV', SQL_USER: 'lector', SQL_PASSWORD: '' }); } catch (x) { return x; } })();
  assert.ok(e);
  assert.equal(/SRV|lector/.test(e.message), false);
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

test('sqlcmd sale siempre en UTF-8 (-f 65001), no en el codigo de pagina de la consola', () => {
  const cred = { server: 's', user: 'u', pass: 'p' };
  for (const opts of [{ textoLargo: true }, {}]) {
    const args = argsDeSqlcmd(cred, 'dev_fidel_db', 'SELECT 1', opts);
    assert.equal(args[args.indexOf('-f') + 1], '65001');
  }
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

test('un script de otra base no se mide contra fidel_db: queda en ? diciendo donde se ejecuta', async () => {
  const scripts = [{ id: 'ml', base: 'fidel_ml_db', sondas: [{ id: 's0', tipo: 'tabla', tabla: 'Setting' }] }];
  const out = await medirAmbiente(scripts, 'dev', { cred: { server: 's', user: 'u', pass: 'p' }, correr: () => { throw new Error('no deberia consultar'); } });
  assert.equal(out.ml.estado, '?');
  assert.match(out.ml.nota, /fidel_ml_db/);
});
