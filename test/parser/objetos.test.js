import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerObjetos } from '../../src/parser/objetos.js';
import { normalizarDefinicion, sinComentarios } from '../../src/parser/normalizar.js';

test('procedure', () => {
  const o = extraerObjetos('CREATE PROCEDURE [dbo].[sp_getselectproducts] AS SELECT 1;');
  assert.deepEqual(o, [{ tipo: 'PROCEDURE', esquema: 'dbo', nombre: 'sp_getselectproducts' }]);
});

test('CREATE OR ALTER tambien', () => {
  const o = extraerObjetos('CREATE OR ALTER FUNCTION dbo.fn_x() RETURNS INT AS BEGIN RETURN 1 END');
  assert.equal(o[0].tipo, 'FUNCTION');
  assert.equal(o[0].nombre, 'fn_x');
});

test('el nombre del archivo miente: el objeto sale del cuerpo', () => {
  const sql = 'ALTER TABLE [dbo].[Producto] ADD [UtilizaPartidas] BIT NOT NULL DEFAULT 0';
  const o = extraerObjetos(sql);
  assert.deepEqual(o, [{ tipo: 'COLUMN', esquema: 'dbo', nombre: 'UtilizaPartidas', tabla: 'Producto', columna: 'UtilizaPartidas' }]);
});

test('columna ampliada a MAX', () => {
  const o = extraerObjetos('ALTER TABLE dbo.Nota ALTER COLUMN Texto NVARCHAR(MAX)');
  assert.equal(o[0].tipo, 'COLUMN_MAX');
});

test('la guarda de idempotencia del INSERT ES la sonda', () => {
  const sql = "IF NOT EXISTS (SELECT 1 FROM [dbo].[Permiso] WHERE [Name] = 'VerPedidos') INSERT INTO [dbo].[Permiso] ([Name]) VALUES ('VerPedidos')";
  const o = extraerObjetos(sql);
  assert.equal(o[0].tipo, 'FILA');
  assert.equal(o[0].tabla, 'Permiso');
  assert.equal(o[0].columna, 'Name');
  assert.equal(o[0].valor, "'VerPedidos'");
});

test('un script sin nada derivable devuelve lista vacia', () => {
  assert.deepEqual(extraerObjetos('EXEC sp_updatestats;'), []);
});

test('un indice suelto se extrae', () => {
  const o = extraerObjetos('CREATE NONCLUSTERED INDEX IX_Pedido_Fecha ON [dbo].[Pedido] (Fecha)');
  assert.deepEqual(o, [{ tipo: 'INDEX', esquema: 'dbo', nombre: 'IX_Pedido_Fecha', tabla: 'Pedido' }]);
});

test('CREATE TABLE + CREATE INDEX en el mismo script NO pierde el indice', () => {
  const sql = 'CREATE TABLE [dbo].[Partida] (Id INT);\nCREATE INDEX IX_Partida_Id ON [dbo].[Partida] (Id);';
  const o = extraerObjetos(sql);
  assert.equal(o.some((x) => x.tipo === 'TABLE'), true);
  assert.equal(o.some((x) => x.tipo === 'INDEX' && x.nombre === 'IX_Partida_Id'), true,
    'la tabla existe aunque el indice no se haya creado: sin esta sonda el veredicto seria un falso OK');
});

test('normalizar saca USE, GO, SET y comentarios, y unifica CREATE con ALTER', () => {
  const a = normalizarDefinicion('USE [dev_fidel_db]\nGO\nSET ANSI_NULLS ON\nGO\n-- hola\nCREATE PROCEDURE dbo.x AS SELECT 1');
  const b = normalizarDefinicion('ALTER   PROCEDURE dbo.x AS  SELECT 1');
  assert.equal(a, b);
});

test('un -- adentro de un literal NO es un comentario: la sonda de FILA no se pierde', () => {
  const sql = "IF NOT EXISTS (SELECT 1 FROM dbo.Config WHERE Clave = 'a--b')\nINSERT INTO dbo.Config (Clave) VALUES ('a--b')";
  const o = extraerObjetos(sql);
  assert.equal(o.length, 1);
  assert.equal(o[0].tipo, 'FILA');
  assert.equal(o[0].valor, "'a--b'");
});

test('un /* adentro de un literal NO abre un comentario de bloque', () => {
  // El "/* nota */" real al final es lo que hace RED al regex viejo: sin conciencia de
  // literales, agarra desde el primer '/*' (adentro de 'x/*y') hasta este '*/' y se come
  // todo el medio, incluido el INSERT.
  const sql = "IF NOT EXISTS (SELECT 1 FROM dbo.Config WHERE Clave = 'x/*y')\nINSERT INTO dbo.Config (Clave) VALUES ('x/*y') /* nota */";
  const o = extraerObjetos(sql);
  assert.equal(o.length, 1);
  assert.equal(o[0].tipo, 'FILA');
  assert.equal(o[0].valor, "'x/*y'");
});

test("una comilla escapada ('') no cierra el literal, y el -- comment real despues SI se saca", () => {
  const limpio = sinComentarios("SELECT 'it''s' -- comment\nGO");
  assert.match(limpio, /'it''s'/);
  assert.doesNotMatch(limpio, /comment/);
});

test('una comilla adentro de [corchetes] no deja un literal abierto: no hay VIEW fantasma', () => {
  const sql = "ALTER TABLE dbo.T ADD [a'b] BIT NULL\nGO\n-- Reemplaza al viejo CREATE VIEW dbo.vw_legacy que se borra\nCREATE PROCEDURE dbo.sp_x AS SELECT 1";
  const o = extraerObjetos(sql);
  const modulos = o.filter((x) => ['PROCEDURE', 'FUNCTION', 'VIEW', 'TRIGGER'].includes(x.tipo)).map((x) => x.nombre);
  assert.deepEqual(modulos, ['sp_x']);
});

test('un -- adentro de un [identificador entre corchetes] no es un comentario, y uno real despues SI se saca', () => {
  const limpio = sinComentarios('SELECT [a--b]\n-- comment real\nGO');
  assert.match(limpio, /\[a--b\]/);
  assert.doesNotMatch(limpio, /comment real/);
});

test('un identificador entre "comillas dobles" no abre un literal de comilla simple', () => {
  const limpio = sinComentarios('SELECT "a\'b" -- comment\nGO');
  assert.match(limpio, /"a'b"/);
  assert.doesNotMatch(limpio, /comment/);
});

test('un corchete escapado (]]) adentro de un identificador no lo cierra antes de tiempo', () => {
  const limpio = sinComentarios("SELECT [x]]y'] -- comment\nGO");
  assert.match(limpio, /\[x\]\]y'\]/);
  assert.doesNotMatch(limpio, /comment/);
});
