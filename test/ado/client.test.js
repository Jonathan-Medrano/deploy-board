import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteAdo } from '../../src/ado/client.js';

const env = { AZURE_ORG: 'https://dev.azure.com/agenciap', AZURE_PROJECT: 'Fidel', AZURE_PAT: 'x' };

test('sin PAT no arranca, y el mensaje no filtra nada', () => {
  assert.throws(() => crearClienteAdo({ ...env, AZURE_PAT: '' }), /AZURE_PAT/);
});

test('el cliente solo lee: no expone nada que escriba en un work item', () => {
  const c = crearClienteAdo(env, { fetch: async () => { throw new Error('no deberia llamar'); } });
  const escrituras = Object.keys(c).filter((k) => /^(set|update|patch|crear|borrar|actualizar)/i.test(k));
  assert.deepEqual(escrituras, [], 'el PAT del .env.example es de LECTURA');
});

test('getWorkItems parte en lotes de 200', async () => {
  const llamadas = [];
  const fake = async (url) => {
    llamadas.push(url);
    return { ok: true, status: 200, json: async () => ({ value: [] }) };
  };
  const c = crearClienteAdo(env, { fetch: fake });
  await c.getWorkItems(Array.from({ length: 450 }, (_, i) => i + 1));
  assert.equal(llamadas.length, 3);
});

test('pide relations, que es de donde salen hijos y adjuntos', async () => {
  let url = '';
  const fake = async (u) => { url = u; return { ok: true, status: 200, json: async () => ({ value: [] }) }; };
  const c = crearClienteAdo(env, { fetch: fake });
  await c.getWorkItems([1]);
  assert.match(url, /\$expand=relations/);
});

test('un error de ADO no arrastra el PAT en el mensaje', async () => {
  const fake = async () => ({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'nope' });
  const c = crearClienteAdo({ ...env, AZURE_PAT: 'SECRETO123' }, { fetch: fake });
  await assert.rejects(() => c.wiql('SELECT 1'), (e) => !String(e.message).includes('SECRETO123'));
});

test('quienSubioCadaAdjunto saca la persona del historial de revisiones', async () => {
  const updates = {
    value: [
      { revisedBy: { displayName: 'Ana Maria Gonzalez', uniqueName: 'ana@trizap.net' },
        relations: { added: [{ rel: 'AttachedFile', attributes: { name: '[U-17714] - 01 - X - ALTER.sql' } }] } },
      { revisedBy: { displayName: 'Otro Dev' },
        relations: { added: [{ rel: 'Hyperlink', attributes: { name: 'no es adjunto' } }] } },
      { revisedBy: { displayName: 'Sin relaciones' }, fields: {} },
    ],
  };
  const c = crearClienteAdo(env, { fetch: async () => ({ ok: true, status: 200, json: async () => updates }) });
  const r = await c.quienSubioCadaAdjunto(25034);
  assert.deepEqual(r, { '[U-17714] - 01 - X - ALTER.sql': { nombre: 'Ana Maria Gonzalez', email: 'ana@trizap.net' } });
});

test('si el mismo archivo se resubio, gana la ultima revision', async () => {
  const updates = {
    value: [
      { revisedBy: { displayName: 'Primero' }, relations: { added: [{ rel: 'AttachedFile', attributes: { name: 'a.sql' } }] } },
      { revisedBy: { displayName: 'Ultimo' }, relations: { added: [{ rel: 'AttachedFile', attributes: { name: 'a.sql' } }] } },
    ],
  };
  const c = crearClienteAdo(env, { fetch: async () => ({ ok: true, status: 200, json: async () => updates }) });
  assert.equal((await c.quienSubioCadaAdjunto(1))['a.sql'].nombre, 'Ultimo');
});

test('acepta AZURE_ORG_URL, que es el nombre que ya usa el equipo', async () => {
  let url = '';
  const fake = async (u) => { url = u; return { ok: true, status: 200, json: async () => ({ value: [] }) }; };
  const c = crearClienteAdo({ AZURE_ORG_URL: 'https://dev.azure.com/agenciap', AZURE_PROJECT: 'Fidel', AZURE_PAT: 'x' }, { fetch: fake });
  await c.getWorkItems([1]);
  assert.match(url, /dev\.azure\.com\/agenciap/);
});

test('una lectura que se corta a nivel de red se reintenta una vez', async () => {
  // Medido el 2026-09-24: sqlcmd es sincronico y bloquea el proceso decenas de segundos;
  // Azure cierra la conexion que node tenia abierta, y el primer pedido despues de medir las
  // bases fallaba con "fetch failed" (la lista de estados y la comparacion stage -> dev).
  let llamadas = 0;
  const fake = async () => {
    llamadas++;
    if (llamadas === 1) throw new TypeError('fetch failed');
    return { ok: true, status: 200, json: async () => ({ value: [{ name: 'Active' }] }) };
  };
  const c = crearClienteAdo(env, { fetch: fake });
  assert.deepEqual(await c.listarEstados('User Story'), ['Active']);
  assert.equal(llamadas, 2);
});

test('si la red falla dos veces seguidas, el error sale', async () => {
  const c = crearClienteAdo(env, { fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(() => c.listarEstados('User Story'), /fetch failed/);
});

function fetchQueResponde(cuerpo) {
  const urls = [];
  const fake = async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => cuerpo }; };
  return { urls, fake };
}

test('listarRepos trae nombre y si esta deshabilitado', async () => {
  const { fake } = fetchQueResponde({ value: [{ id: 'a', name: 'Api.Net' }, { id: 'b', name: 'Viejo', isDisabled: true }] });
  const c = crearClienteAdo(env, { fetch: fake });
  assert.deepEqual(await c.listarRepos(), [
    { id: 'a', nombre: 'Api.Net', deshabilitado: false },
    { id: 'b', nombre: 'Viejo', deshabilitado: true },
  ]);
});

test('listarRamas devuelve los nombres sin refs/heads/ y escapa el repo', async () => {
  const { urls, fake } = fetchQueResponde({ value: [{ name: 'refs/heads/dev' }, { name: 'refs/heads/feature/x' }] });
  const c = crearClienteAdo(env, { fetch: fake });
  assert.deepEqual(await c.listarRamas('Repo Raro'), ['dev', 'feature/x']);
  assert.match(urls[0], /repositories\/Repo%20Raro\/refs\?filter=heads\//);
});

test('contarPendientes lee aheadCount del diff destino -> origen', async () => {
  const { urls, fake } = fetchQueResponde({ aheadCount: 7, behindCount: 2, changes: [] });
  const c = crearClienteAdo(env, { fetch: fake });
  assert.equal(await c.contarPendientes('Api.Net', 'dev', 'master'), 7);
  assert.match(urls[0], /baseVersion=master&baseVersionType=branch&targetVersion=dev&targetVersionType=branch/);
});

test('sin aheadCount no se inventa un cero: es un error', async () => {
  const { fake } = fetchQueResponde({ changes: [] });
  const c = crearClienteAdo(env, { fetch: fake });
  await assert.rejects(() => c.contarPendientes('Api.Net', 'dev', 'master'), /aheadCount/);
});

test('commitsPendientes devuelve hash corto, primera linea, autor y fecha', async () => {
  const { urls, fake } = fetchQueResponde({ value: [{
    commitId: '0123456789abcdef', comment: 'fix: algo\n\ncuerpo largo', author: { name: 'Ana', date: '2026-10-01T10:00:00Z' },
  }] });
  const c = crearClienteAdo(env, { fetch: fake });
  assert.deepEqual(await c.commitsPendientes('Api.Net', 'dev', 'master'), [
    { id: '01234567', mensaje: 'fix: algo', autor: 'Ana', fecha: '2026-10-01' },
  ]);
  // Azure devuelve lo que compareVersion tiene y itemVersion no (medido 2026-10-02 en Fidel.MercadoLibre.Api).
  assert.match(urls[0], /itemVersion\.version=master&searchCriteria\.compareVersion\.version=dev&searchCriteria\.\$top=50/);
});

test('prsActivos filtra por origen, destino y estado activo', async () => {
  const { urls, fake } = fetchQueResponde({ value: [{ pullRequestId: 25739, title: 'StageToDev' }] });
  const c = crearClienteAdo(env, { fetch: fake });
  assert.deepEqual(await c.prsActivos('FidelFrontWeb', 'stage', 'develop'), [{ id: 25739, titulo: 'StageToDev' }]);
  assert.match(urls[0], /sourceRefName=refs%2Fheads%2Fstage&searchCriteria\.targetRefName=refs%2Fheads%2Fdevelop&searchCriteria\.status=active/);
});

test('urlDePr arma el link sin llamar a la red', () => {
  const c = crearClienteAdo(env, { fetch: async () => { throw new Error('no deberia llamar'); } });
  assert.equal(c.urlDePr('Api.Net', 7), 'https://dev.azure.com/agenciap/Fidel/_git/Api.Net/pullrequest/7');
});
