import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerObjetos } from '../../src/parser/objetos.js';
import { derivarSondas } from '../../src/sondas/derivar.js';
import { veredicto } from '../../src/sondas/veredicto.js';

test('un modulo da una sonda que compara la definicion viva', () => {
  const sql = 'CREATE PROCEDURE dbo.sp_x AS SELECT 1;';
  const s = derivarSondas(extraerObjetos(sql), sql, 'x.sql');
  assert.equal(s.length, 1);
  assert.equal(s[0].tipo, 'modulo');
  assert.equal(s[0].objeto, 'sp_x');
  assert.equal(typeof s[0].esperado, 'string');
});

test('sin objetos derivables la sonda es sin_sonda, con motivo', () => {
  const s = derivarSondas([], 'EXEC sp_updatestats;', 'raro.sql');
  assert.equal(s.length, 1);
  assert.equal(s[0].tipo, 'sin_sonda');
  assert.match(s[0].detalle, /raro\.sql/);
});

test('cada sonda tiene id estable y unico', () => {
  const sql = 'ALTER TABLE dbo.P ADD a BIT; ALTER TABLE dbo.P ADD b BIT;';
  const s = derivarSondas(extraerObjetos(sql), sql, 'x.sql');
  assert.equal(new Set(s.map((x) => x.id)).size, s.length);
});

const VIVO = 'CREATE PROCEDURE dbo.sp_x AS SELECT 1;';
const todoSi = (sondas) => Object.fromEntries(sondas.map((x) => [x.id, 'SI']));
const medir = (sql, defs) => {
  const sondas = derivarSondas(extraerObjetos(sql), sql, 'x.sql');
  return { sondas, v: veredicto(sondas, todoSi(sondas), defs) };
};

for (const [caso, sql] of Object.entries({
  'un DROP IF EXISTS en el lote anterior': "IF OBJECT_ID('dbo.sp_x') IS NOT NULL DROP PROCEDURE dbo.sp_x\nGO\n" + VIVO,
  'un GRANT en el lote siguiente': VIVO + '\nGO\nGRANT EXECUTE ON dbo.sp_x TO app\n',
  'los SET de SSMS en lotes propios': 'SET ANSI_NULLS ON\nGO\nSET QUOTED_IDENTIFIER ON\nGO\n' + VIVO + '\nGO\n',
  'con fines de linea CRLF': "IF OBJECT_ID('dbo.sp_x') IS NOT NULL DROP PROCEDURE dbo.sp_x\r\nGO\r\n" + VIVO + '\r\nGO\r\n',
})) {
  test(`un SP corrido da OK aunque el archivo traiga ${caso}`, () => {
    assert.equal(medir(sql, { sp_x: VIVO }).v.estado, 'OK');
  });
}

test('si el cuerpo vivo es otro, da FALTA: el lote no tapa una diferencia real', () => {
  const sql = "IF OBJECT_ID('dbo.sp_x') IS NOT NULL DROP PROCEDURE dbo.sp_x\nGO\n" + VIVO;
  assert.equal(medir(sql, { sp_x: 'CREATE PROCEDURE dbo.sp_x AS SELECT 2;' }).v.estado, 'FALTA');
});

test('dos procedures en el mismo archivo dan dos sondas, y las dos se comparan', () => {
  const a = 'CREATE PROCEDURE dbo.sp_a AS SELECT 1;';
  const b = 'CREATE PROCEDURE dbo.sp_b AS SELECT 2;';
  const { sondas, v } = medir(a + '\nGO\n' + b + '\nGO\n', { sp_a: a, sp_b: b });
  assert.deepEqual(sondas.map((x) => x.objeto).sort(), ['sp_a', 'sp_b']);
  assert.equal(v.estado, 'OK');
});

test('una columna nueva y un SP en el mismo archivo: OK si los dos estan', () => {
  const sql = 'ALTER TABLE dbo.P ADD c BIT NULL\nGO\n' + VIVO + '\nGO\n';
  assert.equal(medir(sql, { sp_x: VIVO }).v.estado, 'OK');
});

test('un modulo mencionado en un comentario NO se sondea: no es un objeto fantasma', () => {
  const sql = VIVO + '\nGO\n-- Reemplaza al viejo CREATE VIEW dbo.vw_legacy que se borra\n';
  const { sondas, v } = medir(sql, { sp_x: VIVO });
  assert.deepEqual(sondas.map((x) => x.objeto), ['sp_x']);
  assert.equal(v.estado, 'OK');
});

test('stub + ALTER real: se hashea el ULTIMO lote, el que quedo vivo en la base', () => {
  const sql = [
    "IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name = 'sp_x')",
    "EXEC('CREATE PROCEDURE dbo.sp_x AS SELECT 1')",
    'GO',
    'ALTER PROCEDURE dbo.sp_x AS',
    'BEGIN',
    '  SELECT 2',
    'END',
    'GO',
  ].join('\n');
  const viva = 'ALTER PROCEDURE dbo.sp_x AS\nBEGIN\n  SELECT 2\nEND';
  assert.equal(medir(sql, { sp_x: viva }).v.estado, 'OK');
});

test('un lote posterior que solo MENCIONA el modulo en un comentario no lo tapa', () => {
  const sql = VIVO + '\nGO\n-- CREATE PROCEDURE dbo.sp_x (version vieja)\nSELECT 1\nGO\n';
  assert.equal(medir(sql, { sp_x: VIVO }).v.estado, 'OK');
});
