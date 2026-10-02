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

test('ANSI de SSMS (Windows-1252): la é de \'% Déb%\' llega como é, no como �', () => {
  const buf = Buffer.from([...Buffer.from("LIKE '% D", 'latin1'), 0xe9, ...Buffer.from("b%'", 'latin1')]);
  assert.equal(buf.toString('utf8').includes('�'), true, 'leido como UTF-8 era lo que daba el falso FALTA');
  assert.equal(decodificarSql(buf), "LIKE '% Déb%'");
});

test('un UTF-8 valido sin BOM se sigue leyendo como UTF-8, no como ANSI', () => {
  assert.equal(decodificarSql(Buffer.from("'% Déb%' — ñ", 'utf8')), "'% Déb%' — ñ");
});

test('lo que el bug original producia: leer UTF-16 como UTF-8 no matchea', () => {
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('CREATE PROCEDURE x', 'utf16le')]);
  assert.equal(/CREATE PROCEDURE/.test(buf.toString('utf8')), false);
  assert.match(decodificarSql(buf), /CREATE PROCEDURE/);
});
