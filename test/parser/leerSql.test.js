import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { decodificarSql, leerSql } from '../../src/parser/leerSql.js';

const FIX = (n) => path.join(import.meta.dirname, '..', 'fixtures', n);

test('UTF-16LE con BOM se decodifica, no queda en bytes sueltos', () => {
  const txt = leerSql(FIX('utf16le.sql'));
  assert.match(txt, /CREATE PROCEDURE/);
  assert.equal(txt.includes('\u0000'), false);
});

test('UTF-8 con BOM pierde el BOM', () => {
  const txt = leerSql(FIX('utf8.sql'));
  assert.equal(txt.startsWith('CREATE'), true);
});

test('CRLF se normaliza a LF', () => {
  assert.equal(decodificarSql(Buffer.from('a\r\nb', 'utf8')), 'a\nb');
});

test('lo que el bug original producia: leer UTF-16 como UTF-8 no matchea', () => {
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('CREATE PROCEDURE x', 'utf16le')]);
  assert.equal(/CREATE PROCEDURE/.test(buf.toString('utf8')), false);
  assert.match(decodificarSql(buf), /CREATE PROCEDURE/);
});
