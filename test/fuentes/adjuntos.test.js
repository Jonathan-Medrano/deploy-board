import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descubrirAdjuntos } from '../../src/fuentes/adjuntos.js';

const NOMBRE = '[U-25051] - PRE - 01 - Columna ActualizarCategoriaTiendaNube en Integracion - ALTER.sql';

function adoFalso() {
  return {
    wiql: async () => [900, 25051],
    getWorkItems: async () => ([
      {
        id: 900,
        fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Scripts Sprint 2', 'System.State': 'In Test' },
        relations: [{ rel: 'AttachedFile', url: 'https://x/att/1', attributes: { name: NOMBRE, resourceCreatedDate: '2026-09-17T17:53:24.367Z' } }],
      },
      {
        id: 25051,
        fields: {
          'System.WorkItemType': 'User Story', 'System.Title': 'Tienda Nube', 'System.State': 'Tested',
          'System.AssignedTo': { displayName: 'Ana Maria Gonzalez' },
          'Custom.CantidadScripts': 2, 'Custom.TieneSP': '0 - No', 'Custom.TieneReporte': '0 - No',
        },
        relations: [],
      },
    ]),
    descargarAdjunto: async () => Buffer.from('ALTER TABLE [dbo].[Integracion] ADD [ActualizarCategoriaTiendaNube] BIT NOT NULL DEFAULT 0', 'utf8'),
    quienSubioCadaAdjunto: async () => ({ [NOMBRE]: 'Ana Maria Gonzalez' }),
  };
}

test('el script se vincula al WI del NOMBRE, no al WI que lo contiene', async () => {
  const { scripts } = await descubrirAdjuntos(adoFalso(), 'Fidel\\2026\\2026 Septiembre 2');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].wiId, 25051);
  assert.equal(scripts[0].fuente, 'adjunto');
});

test('la task contenedora se registra aparte, con su estado y los ids que lleva', async () => {
  const { tasks, scripts } = await descubrirAdjuntos(adoFalso(), 'iter');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 900);
  assert.equal(tasks[0].estado, 'In Test');
  assert.deepEqual(tasks[0].adjuntos, [scripts[0].id]);
});

test('los campos Custom llegan al WorkItemMadre', async () => {
  const { wis } = await descubrirAdjuntos(adoFalso(), 'iter');
  const us = wis.find((w) => w.id === 25051);
  assert.equal(us.estado, 'Tested');
  assert.equal(us.cantidadScripts, 2);
  assert.equal(us.tieneSP, '0 - No');
});

test('un adjunto que no es .sql se ignora', async () => {
  const ado = adoFalso();
  ado.getWorkItems = async () => ([{
    id: 900, fields: { 'System.WorkItemType': 'Task', 'System.Title': 'x', 'System.State': 'New' },
    relations: [{ rel: 'AttachedFile', url: 'https://x/a', attributes: { name: 'planilla.xlsx' } }],
  }]);
  const { scripts } = await descubrirAdjuntos(ado, 'iter');
  assert.equal(scripts.length, 0);
});

test('registra quien subio el adjunto, con la fecha del ADJUNTO no la de la revision', async () => {
  const { scripts } = await descubrirAdjuntos(adoFalso(), 'iter');
  assert.deepEqual(scripts[0].responsables.subioElAdjunto, {
    nombre: 'Ana Maria Gonzalez',
    fecha: '2026-09-17',
  });
});

test('el dueno del work item llega al WorkItemMadre', async () => {
  const { wis } = await descubrirAdjuntos(adoFalso(), 'iter');
  assert.equal(wis.find((w) => w.id === 25051).asignadoA, 'Ana Maria Gonzalez');
});

test('el historial se consulta UNA vez por work item, no una por adjunto', async () => {
  let llamadas = 0;
  const ado = adoFalso();
  ado.quienSubioCadaAdjunto = async () => { llamadas++; return {}; };
  await descubrirAdjuntos(ado, 'iter');
  assert.equal(llamadas, 1);
});

test('el WIQL de la iteracion va SIN filtro de asignado', async () => {
  let consulta = '';
  const ado = adoFalso();
  ado.wiql = async (c) => { consulta = c; return []; };
  ado.getWorkItems = async () => [];
  ado.quienSubioCadaAdjunto = async () => ({});
  await descubrirAdjuntos(ado, 'Fidel\\2026\\2026 Septiembre 2');
  assert.equal(/@Me|AssignedTo/i.test(consulta), false);
  assert.match(consulta, /IterationPath/);
});

test('un script sin [U-xxxxx] se vincula al contenedor, marcado como inferido', async () => {
  const ado = adoFalso();
  ado.getWorkItems = async () => ([{
    id: 17597,
    fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Scripts', 'System.State': 'Resolved' },
    relations: [
      { rel: 'AttachedFile', url: 'https://x/a', attributes: { name: 'sp_ObtenerUsuarioPorId.sql', resourceCreatedDate: '2026-09-17T00:00:00Z' } },
      { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://x/wi/17228', attributes: { name: 'Parent' } },
    ],
  }]);
  const { scripts } = await descubrirAdjuntos(ado, 'iter');
  assert.equal(scripts[0].wiId, 17597, 'cuelga del contenedor');
  assert.equal(scripts[0].vinculadoPor, 'contenedor');
  assert.equal(scripts[0].contenedorPadre, 17228);
});

test('un script CON [U-xxxxx] ignora el contenedor: el nombre manda', async () => {
  const { scripts } = await descubrirAdjuntos(adoFalso(), 'iter');
  assert.equal(scripts[0].wiId, 25051);
  assert.equal(scripts[0].vinculadoPor, 'nombre');
});

test('los respaldos __OLD/__NEW no cuentan como scripts, no se descargan y quedan en respaldos', async () => {
  const normal = '[U-1] - 01 - X - ALTER.sql';
  let llamadasDescarga = 0;
  const ado = {
    wiql: async () => [900],
    getWorkItems: async () => ([
      {
        id: 900,
        fields: { 'System.WorkItemType': 'Task', 'System.Title': 'Scripts', 'System.State': 'New' },
        relations: [
          { rel: 'AttachedFile', url: 'https://x/a1', attributes: { name: 'sp_x__OLD.sql', resourceCreatedDate: '2026-09-17T00:00:00Z' } },
          { rel: 'AttachedFile', url: 'https://x/a2', attributes: { name: 'sp_x__NEW.sql', resourceCreatedDate: '2026-09-17T00:00:00Z' } },
          { rel: 'AttachedFile', url: 'https://x/a3', attributes: { name: normal, resourceCreatedDate: '2026-09-17T00:00:00Z' } },
        ],
      },
    ]),
    descargarAdjunto: async (url) => {
      llamadasDescarga++;
      return Buffer.from('ALTER TABLE dbo.T ADD C INT NULL', 'utf8');
    },
    quienSubioCadaAdjunto: async () => ({}),
  };
  const { scripts, respaldos } = await descubrirAdjuntos(ado, 'iter');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].archivo, normal);
  assert.equal(respaldos.length, 2);
  assert.deepEqual(respaldos.map((r) => r.archivo).sort(), ['sp_x__NEW.sql', 'sp_x__OLD.sql']);
  assert.ok(respaldos.every((r) => r.wiId === 900));
  assert.equal(llamadasDescarga, 1, 'solo se descarga el script normal, nunca los respaldos');
});

test('un bug adjuntado a su User Story no convierte a la US en "task de SCRIPTS"', async () => {
  const nombre = '[B-700] - 01 - Fix - ALTER.sql';
  const ado = {
    wiql: async () => [650, 700],
    getWorkItems: async () => ([
      {
        id: 650,
        fields: { 'System.WorkItemType': 'User Story', 'System.Title': 'US', 'System.State': 'Active' },
        relations: [{ rel: 'AttachedFile', url: 'https://x/att/9', attributes: { name: nombre, resourceCreatedDate: '2026-09-17T00:00:00Z' } }],
      },
      { id: 700, fields: { 'System.WorkItemType': 'Bug', 'System.Title': 'B', 'System.State': 'Tested' }, relations: [] },
    ]),
    descargarAdjunto: async () => Buffer.from('ALTER TABLE [dbo].[T] ADD [C] INT NULL', 'utf8'),
    quienSubioCadaAdjunto: async () => ({}),
  };
  const { tasks, scripts } = await descubrirAdjuntos(ado, 'iter');
  assert.equal(scripts.length, 1);
  assert.deepEqual(tasks, []);
});

test('cada adjunto lleva el tipo de su contenedor, legible o no', async () => {
  const ado = adoFalso();
  ado.getWorkItems = async () => ([
    {
      id: 24768,
      fields: { 'System.WorkItemType': 'User Story', 'System.Title': 'US', 'System.State': 'Active' },
      relations: [{ rel: 'AttachedFile', url: 'https://x/ok', attributes: { name: 'sp_x.sql' } }],
    },
    {
      id: 25170,
      fields: { 'System.WorkItemType': 'Task', 'System.Title': 'US-24768_Filtro_Categoria_Clie', 'System.State': 'Active' },
      relations: [{ rel: 'AttachedFile', url: 'https://x/roto', attributes: { name: 'sp_x.sql' } }],
    },
  ]);
  ado.descargarAdjunto = async (url) => {
    if (url.endsWith('roto')) throw new Error('404');
    return Buffer.from('SELECT 1', 'utf8');
  };
  ado.quienSubioCadaAdjunto = async () => ({});
  const { scripts } = await descubrirAdjuntos(ado, 'iter');
  const porContenedor = Object.fromEntries(scripts.map((x) => [x.contenedorId, x.contenedorTipo]));
  assert.deepEqual(porContenedor, { 24768: 'User Story', 25170: 'Task' });
  const titulos = Object.fromEntries(scripts.map((x) => [x.contenedorId, x.contenedorTitulo]));
  assert.deepEqual(titulos, { 24768: 'US', 25170: 'US-24768_Filtro_Categoria_Clie' });
});
