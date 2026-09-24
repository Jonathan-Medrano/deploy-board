import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteAdo } from '../../src/ado/client.js';

const env = { AZURE_ORG: 'https://dev.azure.com/agenciap', AZURE_PROJECT: 'Fidel', AZURE_PAT: 'x' };

test('sin PAT no arranca, y el mensaje no filtra nada', () => {
  assert.throws(() => crearClienteAdo({ ...env, AZURE_PAT: '' }), /AZURE_PAT/);
});

test('setCampos rechaza System.State: el estado de la madre lo mueve una persona', async () => {
  const c = crearClienteAdo(env, { fetch: async () => { throw new Error('no deberia llamar'); } });
  await assert.rejects(() => c.setCampos(1, { 'System.State': 'Tested' }), /System\.State/);
});

test('el rechazo de System.State no se esquiva escribiendolo distinto', async () => {
  const c = crearClienteAdo(env, { fetch: async () => { throw new Error('no deberia llamar'); } });
  for (const clave of ['system.state', 'SYSTEM.STATE', 'System.state']) {
    await assert.rejects(() => c.setCampos(1, { [clave]: 'Tested' }), /System\.State/,
      `${clave} esquivo el guard`);
  }
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
