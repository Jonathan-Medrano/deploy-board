import test from 'node:test';
import assert from 'node:assert/strict';
import { medirTodo, opcionesDelRepo } from '../src/medir.js';
import { REPO_POR_DEFECTO, RAMA_POR_DEFECTO } from '../src/fuentes/repoAdo.js';

test('sin configurar, el lado repo sale del Api.Net de Azure', () => {
  assert.deepEqual(opcionesDelRepo({}), { repo: REPO_POR_DEFECTO, rama: RAMA_POR_DEFECTO });
});

test('el repo y la rama se pueden cambiar sin tocar codigo', () => {
  const o = opcionesDelRepo({ DEPLOY_BOARD_REPO_SCRIPTS: 'Otro', DEPLOY_BOARD_RAMA_SCRIPTS: 'main' });
  assert.deepEqual(o, { repo: 'Otro', rama: 'main' });
});

const adoBase = () => ({ wiql: async () => [], getWorkItems: async () => [], listarEstados: async () => [] });
const deps = (extra = {}) => ({ env: {}, ado: adoBase(), medirAmbiente: async () => ({}), ...extra });

test('sin sprint configurado avisa y dice QUE se pierde', async () => {
  const { avisos } = await medirTodo({ ambientes: [] }, deps());
  assert.ok(avisos.some((a) => /DEPLOY_BOARD_SPRINT/.test(a)), JSON.stringify(avisos));
  assert.ok(avisos.some((a) => /NO se pueden detectar/.test(a)), JSON.stringify(avisos));
});

test('si Azure no contesta, la medicion de ambientes sigue y el fallo NO pasa callado', async () => {
  const { reporte, avisos } = await medirTodo(
    { sprint: 'S', ambientes: [] },
    deps({ descubrirRepo: async () => { throw new Error('403 Forbidden'); } })
  );
  assert.ok(avisos.some((a) => /403 Forbidden/.test(a)), JSON.stringify(avisos));
  assert.ok(avisos.some((a) => /NO se pueden detectar/.test(a)), JSON.stringify(avisos));
  assert.ok(reporte, 'el reporte tiene que existir igual');
});

test('una carpeta de sprint vacia avisa: es indistinguible de no haber comparado', async () => {
  const { avisos } = await medirTodo(
    { sprint: 'Sprint_X', ambientes: [] },
    deps({ descubrirRepo: async () => [] })
  );
  assert.ok(avisos.some((a) => a.includes('Sprint_X')), JSON.stringify(avisos));
});

test('con scripts en el repo no hay aviso y el lado repo entra en la reconciliacion', async () => {
  const delRepo = [{
    archivo: '[U-1] - Algo - ALTER.sql', wiId: 1, esPre: false, orden: null, accion: 'ALTER',
    descripcion: 'Algo', wiTipo: 'U', vinculadoPor: 'nombre',
    id: '1/[u-1] - algo - alter', objetos: [], sql: '', fuente: 'repo', carpeta: 'US-1',
    responsables: {}, sondas: [],
  }];
  const { reporte, avisos } = await medirTodo(
    { sprint: 'S', ambientes: [] },
    deps({ descubrirRepo: async () => delRepo })
  );
  assert.equal(avisos.some((a) => /NO se pueden detectar/.test(a)), false, JSON.stringify(avisos));
  assert.equal(reporte.orden.length, 1);
});

test('el sprint y la rama viajan a quien lee el repo, no se adivinan adentro', async () => {
  let recibido = null;
  await medirTodo(
    { sprint: 'Sprint_Z', ambientes: [] },
    deps({ env: { DEPLOY_BOARD_RAMA_SCRIPTS: 'main' }, descubrirRepo: async (ado, o) => { recibido = o; return []; } })
  );
  assert.equal(recibido.sprint, 'Sprint_Z');
  assert.equal(recibido.rama, 'main');
});
