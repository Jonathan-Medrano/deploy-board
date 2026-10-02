import test from 'node:test';
import assert from 'node:assert/strict';
import { crearPr, descripcionDelPr, LARGO_MAXIMO_DESCRIPCION } from '../../src/ado/prs.js';

const env = { AZURE_ORG_URL: 'https://agenciap.visualstudio.com/', AZURE_PROJECT: 'Fidel', AZURE_PAT: 'SECRETO123' };

test('crea el PR con ramas completas, titulo y descripcion, y devuelve el link', async () => {
  let pedido = null;
  const fake = async (url, opts) => { pedido = { url, ...opts, body: JSON.parse(opts.body) }; return { ok: true, status: 201, json: async () => ({ pullRequestId: 25900 }) }; };
  const r = await crearPr(env, { repo: 'Api.Net', origen: 'master', destino: 'main', titulo: 'StageToMain', descripcion: 'x' }, { fetch: fake });
  assert.equal(pedido.method, 'POST');
  assert.equal(pedido.url, 'https://agenciap.visualstudio.com/Fidel/_apis/git/repositories/Api.Net/pullrequests?api-version=7.0');
  assert.deepEqual(pedido.body, { sourceRefName: 'refs/heads/master', targetRefName: 'refs/heads/main', title: 'StageToMain', description: 'x' });
  assert.deepEqual(r, { id: 25900, link: 'https://agenciap.visualstudio.com/Fidel/_git/Api.Net/pullrequest/25900' });
});

test('un 403 dice que falta permiso, sin el PAT', async () => {
  const fake = async () => ({ ok: false, status: 403, statusText: 'Forbidden', json: async () => ({}) });
  await assert.rejects(
    () => crearPr(env, { repo: 'Api.Net', origen: 'master', destino: 'main', titulo: 'T', descripcion: '' }, { fetch: fake }),
    (e) => /permiso para crear PRs en Api\.Net/.test(e.message) && !e.message.includes('SECRETO123'),
  );
});

test('un 409 de Azure (TF401179) dice que ya hay un PR activo', async () => {
  const fake = async () => ({ ok: false, status: 409, statusText: 'Conflict', json: async () => ({ message: 'TF401179: An active pull request for the source and target branch already exists.' }) });
  await assert.rejects(
    () => crearPr(env, { repo: 'Api.Net', origen: 'master', destino: 'main', titulo: 'T', descripcion: '' }, { fetch: fake }),
    (e) => /ya hay un PR activo/.test(e.message) && e.status === 409,
  );
});

test('no reintenta: un POST repetido duplicaria el PR', async () => {
  let llamadas = 0;
  const fake = async () => { llamadas++; throw new Error('fetch failed'); };
  await assert.rejects(() => crearPr(env, { repo: 'R', origen: 'a', destino: 'b', titulo: 'T', descripcion: '' }, { fetch: fake }));
  assert.equal(llamadas, 1);
});

test('sin PAT no arranca', async () => {
  await assert.rejects(() => crearPr({ ...env, AZURE_PAT: '' }, { repo: 'R', origen: 'a', destino: 'b', titulo: 'T' }, { fetch: async () => ({}) }), /AZURE_PAT/);
});

test('la descripcion lista hasta 50 commits, dice cuantos mas y nunca pasa de 4000', () => {
  const commits = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, mensaje: 'x'.repeat(100), autor: 'Ana' }));
  const d = descripcionDelPr({ quien: 'Jonathan', commits, pendientes: 75 });
  assert.match(d, /^Creado desde deploy-board por Jonathan\./);
  assert.ok(d.length <= LARGO_MAXIMO_DESCRIPCION, String(d.length));
  const corta = descripcionDelPr({ quien: null, commits: commits.slice(0, 2), pendientes: 5 });
  assert.equal(corta, 'Creado desde deploy-board.\n\n- c0 ' + 'x'.repeat(100) + ' (Ana)\n- c1 ' + 'x'.repeat(100) + ' (Ana)\n- y 3 más');
});

test('otro rechazo de Azure trae su motivo, sin el PAT', async () => {
  const fake = async () => ({ ok: false, status: 400, statusText: 'Bad Request', json: async () => ({ message: 'TF401398: The pull request cannot be activated because the source and/or the target branch no longer exists.' }) });
  await assert.rejects(
    () => crearPr(env, { repo: 'Api.Net', origen: 'master', destino: 'main', titulo: 'T', descripcion: '' }, { fetch: fake }),
    (e) => /TF401398/.test(e.message) && e.status === 502 && !e.message.includes('SECRETO123'),
  );
});

test('una respuesta 2xx sin id de PR es un error claro, no un link a /undefined', async () => {
  const fake = async () => ({ ok: true, status: 200, json: async () => ({}) });
  await assert.rejects(
    () => crearPr(env, { repo: 'Api.Net', origen: 'master', destino: 'main', titulo: 'T', descripcion: '' }, { fetch: fake }),
    (e) => e.status === 502 && /no devolvió el número del PR/.test(e.message),
  );
});
