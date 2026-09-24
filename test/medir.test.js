import test from 'node:test';
import assert from 'node:assert/strict';
import { medirTodo, opcionesDelRepo, RAMA_MAIN_POR_DEFECTO } from '../src/medir.js';
import { REPO_POR_DEFECTO, RAMA_POR_DEFECTO } from '../src/fuentes/repoAdo.js';

test('sin configurar, el lado repo sale del Api.Net de Azure', () => {
  assert.deepEqual(opcionesDelRepo({}), { repo: REPO_POR_DEFECTO, rama: RAMA_POR_DEFECTO, ramaMain: RAMA_MAIN_POR_DEFECTO });
});

test('el repo y la rama se pueden cambiar sin tocar codigo', () => {
  const o = opcionesDelRepo({ DEPLOY_BOARD_REPO_SCRIPTS: 'Otro', DEPLOY_BOARD_RAMA_SCRIPTS: 'stage' });
  assert.deepEqual(o, { repo: 'Otro', rama: 'stage', ramaMain: RAMA_MAIN_POR_DEFECTO });
});

test('la rama main tambien se puede cambiar sin tocar codigo', () => {
  const o = opcionesDelRepo({ DEPLOY_BOARD_RAMA_MAIN: 'master-legacy' });
  assert.equal(o.ramaMain, 'master-legacy');
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

test('medir sin stage medido y destino stage: UN solo aviso que menciona D3 y D4', async () => {
  const { avisos } = await medirTodo({ ambientes: ['dev'], destino: 'stage' }, deps());
  const deStage = avisos.filter((a) => /No se midio stage/.test(a));
  assert.equal(deStage.length, 1, `un solo aviso de stage, no dos: ${JSON.stringify(avisos)}`);
  assert.match(deStage[0], /D3/);
  assert.match(deStage[0], /D4/);
});

test('medir con destino distinto de stage: D3 (del destino) y D4 (de stage) quedan en avisos SEPARADOS', async () => {
  const { avisos } = await medirTodo({ ambientes: [], destino: 'dev' }, deps());
  const deDev = avisos.find((a) => /No se midio dev/.test(a));
  const deStage = avisos.find((a) => /No se midio stage/.test(a));
  assert.ok(deDev, JSON.stringify(avisos));
  assert.ok(deStage, JSON.stringify(avisos));
  assert.match(deDev, /D3/);
  assert.doesNotMatch(deDev, /D4/);
  assert.match(deStage, /D4/);
  assert.doesNotMatch(deStage, /D3/);
});

test('sin carpeta de sprint el aviso no culpa a una variable del .env', async () => {
  const { avisos } = await medirTodo({ sprint: null, ambientes: [] }, deps());
  const a = avisos.find((x) => /NO se pueden detectar/.test(x));
  assert.ok(a, JSON.stringify(avisos));
  assert.doesNotMatch(a, /falta DEPLOY_BOARD_SPRINT/);
});

test('si hay respaldos __OLD/__NEW adjuntos, hay UN aviso que dice cuantos', async () => {
  const { avisos } = await medirTodo(
    { ambientes: [] },
    deps({
      ado: {
        ...adoBase(),
        wiql: async () => [1],
        getWorkItems: async () => ([{
          id: 1,
          fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Scripts', 'System.State': 'New' },
          relations: [
            { rel: 'AttachedFile', url: 'https://x/a1', attributes: { name: 'sp_x__OLD.sql', resourceCreatedDate: '2026-09-17T00:00:00Z' } },
            { rel: 'AttachedFile', url: 'https://x/a2', attributes: { name: 'sp_x__NEW.sql', resourceCreatedDate: '2026-09-17T00:00:00Z' } },
          ],
        }]),
        descargarAdjunto: async () => Buffer.from(''),
        quienSubioCadaAdjunto: async () => ({}),
      },
    })
  );
  const deRespaldos = avisos.filter((a) => /respaldos \(__OLD\/__NEW\)/.test(a));
  assert.equal(deRespaldos.length, 1, JSON.stringify(avisos));
  assert.match(deRespaldos[0], /Se dejaron afuera 2 respaldos/);
});

// ---------------- 'Ya en rama MAIN' ----------------

test('con sprint elegido, reporte.enMain trae la entrada de main y reporte.ramaMain queda seteado', async () => {
  const porRama = {
    dev: [{
      archivo: '[U-1] - Algo - ALTER.sql', wiId: 1, esPre: false, orden: null, accion: 'ALTER',
      descripcion: 'Algo', wiTipo: 'U', vinculadoPor: 'nombre',
      id: '1/algo/alter', objetos: [], sql: '', fuente: 'repo', carpeta: 'US-1',
      responsables: {}, sondas: [], hash: 'h1',
    }],
    main: [{ archivo: '[U-1] - Renombrado - ALTER.sql', hash: 'h1' }],
  };
  const { reporte } = await medirTodo(
    { sprint: 'S', ambientes: [] },
    deps({ descubrirRepo: async (ado, o) => porRama[o.rama] || [] })
  );
  assert.deepEqual(reporte.enMain, { '1/algo/alter': 'igual' });
  assert.equal(reporte.ramaMain, RAMA_MAIN_POR_DEFECTO);
});

test('sin sprint, no se lee main: enMain vacio y ramaMain null', async () => {
  const ramasConsultadas = [];
  const { reporte } = await medirTodo(
    { ambientes: [] },
    deps({ descubrirRepo: async (ado, o) => { ramasConsultadas.push(o.rama); return []; } })
  );
  assert.deepEqual(reporte.enMain, {});
  assert.equal(reporte.ramaMain, null);
  assert.deepEqual(ramasConsultadas, [], 'sin sprint no se llama a descubrirRepo ni para dev ni para main');
});

test('si falla la lectura de main, hay un aviso puntual y la medicion sigue', async () => {
  const { reporte, avisos } = await medirTodo(
    { sprint: 'S', ambientes: [] },
    deps({
      descubrirRepo: async (ado, o) => {
        if (o.rama === RAMA_MAIN_POR_DEFECTO) throw new Error('502 Bad Gateway');
        return [];
      },
    })
  );
  assert.ok(avisos.some((a) => /rama main/.test(a) && /502 Bad Gateway/.test(a) && /no se evaluo/.test(a)), JSON.stringify(avisos));
  assert.deepEqual(reporte.enMain, {});
  assert.equal(reporte.ramaMain, null);
});

// ---------------- work items fuera del sprint ----------------
// Un script nombrado [B-25038] puede colgar de una task del sprint aunque el Bug 25038 este en
// otra iteracion: la consulta del sprint no lo trae y la fila salia "(sin estado)".

const scriptDe = (wiId) => ({
  archivo: `[B-${wiId}] - PRE - Busqueda - ALTER.sql`, wiId, esPre: true, orden: null, accion: 'ALTER',
  descripcion: 'Busqueda', vinculadoPor: 'nombre', id: `${wiId}/busqueda/alter`, objetos: [], sql: '',
  fuente: 'repo', carpeta: `BUG-${wiId}`, responsables: {}, sondas: [], hash: `h${wiId}`,
});

test('un work item que un script nombra y no esta en el sprint se trae aparte, marcado fueraDelSprint', async () => {
  const pedidos = [];
  const ado = {
    ...adoBase(),
    getWorkItems: async (ids) => {
      pedidos.push(ids);
      return ids.map((id) => ({ id, fields: { 'System.WorkItemType': 'Bug', 'System.Title': 'Busqueda por codigo', 'System.State': 'Closed', 'System.AssignedTo': { displayName: 'Ana' } } }));
    },
  };
  const { reporte, avisos } = await medirTodo(
    { sprint: 'S', ambientes: [] },
    deps({ ado, descubrirRepo: async (a, o) => (o.rama === RAMA_MAIN_POR_DEFECTO ? [] : [scriptDe(25038)]) })
  );
  assert.deepEqual(pedidos, [[25038]], 'una sola llamada, con los ids que faltan');
  const wi = reporte.wis.find((w) => w.id === 25038);
  assert.ok(wi, JSON.stringify(reporte.wis));
  assert.equal(wi.estado, 'Closed');
  assert.equal(wi.titulo, 'Busqueda por codigo');
  assert.equal(wi.asignadoA, 'Ana');
  assert.equal(wi.fueraDelSprint, true);
  assert.equal(avisos.some((a) => /fuera del sprint/.test(a)), false, JSON.stringify(avisos));
});

test('si no se pueden traer los work items fuera del sprint, hay un aviso y la medicion sigue', async () => {
  const ado = { ...adoBase(), getWorkItems: async () => { throw new Error('500 boom'); } };
  const { reporte, avisos } = await medirTodo(
    { sprint: 'S', ambientes: [] },
    deps({ ado, descubrirRepo: async (a, o) => (o.rama === RAMA_MAIN_POR_DEFECTO ? [] : [scriptDe(25038), scriptDe(25040)]) })
  );
  const a = avisos.find((x) => /No pude traer 2 work items fuera del sprint/.test(x));
  assert.ok(a, JSON.stringify(avisos));
  assert.match(a, /500 boom/);
  assert.match(a, /quedan sin estado/);
  assert.match(a, /pueden figurar como bloqueantes \(D2\/D3\) aunque esten cerrados o pausados\./);
  assert.equal(reporte.orden.length, 2);
});

test('sin work items faltantes no se hace ninguna llamada extra', async () => {
  let llamadas = 0;
  const ado = { ...adoBase(), getWorkItems: async () => { llamadas++; return []; } };
  await medirTodo({ sprint: 'S', ambientes: [] }, deps({ ado, descubrirRepo: async () => [] }));
  assert.equal(llamadas, 0);
});

test('los pendientes de una persona con dos nombres salen bajo uno solo, y el rol acepta su mail', async () => {
  const ado = {
    ...adoBase(),
    wiql: async () => [7],
    getWorkItems: async () => [{ id: 7, fields: { 'System.WorkItemType': 'User Story', 'System.State': 'Active',
      'System.AssignedTo': { displayName: 'Juan Ignacio Denipoti', uniqueName: 'juan.ignacio.denipoti@trizap.net' } }, relations: [] }],
    autoresDe: async () => [{ nombre: 'Juani Denipoti', email: 'juan.ignacio.denipoti@trizap.net' }],
  };
  const { reporte } = await medirTodo(
    { sprint: 'S', ambientes: [] },
    deps({
      ado,
      env: { RESPONSABLE_PROMOCION: 'juan.ignacio.denipoti@trizap.net' },
      descubrirRepo: async () => [{ id: 'r1', archivo: '[U-7] - x - ALTER.sql', wiId: 7, fuente: 'repo', objetos: [], sondas: [],
        responsables: { commiteoEnElRepo: { nombre: 'Juani Denipoti', email: 'juan.ignacio.denipoti@trizap.net', fecha: '2026-09-24' } } }],
    })
  );
  const nombres = JSON.stringify(reporte);
  assert.equal(nombres.includes('Juani Denipoti'), false, nombres);
});

test('si no se pueden leer los autores, se mide igual y se avisa', async () => {
  const ado = { ...adoBase(), autoresDe: async () => { throw new Error('500'); } };
  const { reporte, avisos } = await medirTodo({ sprint: 'S', ambientes: [] }, deps({ ado, descubrirRepo: async () => [] }));
  assert.ok(reporte);
  assert.ok(avisos.some((a) => /autores/.test(a) && /500/.test(a)), JSON.stringify(avisos));
});
