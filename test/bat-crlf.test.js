import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');

function bats(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...bats(abs));
    else if (/\.bat$/i.test(e.name)) out.push(abs);
  }
  return out;
}

test('todo .bat esta en CRLF: con LF, cmd se come la primera letra de cada linea y no arranca', () => {
  const encontrados = bats(RAIZ);
  assert.ok(encontrados.length >= 2, 'tienen que estar iniciar.bat y scripts/arrancar.bat');
  for (const f of encontrados) {
    const txt = fs.readFileSync(f, 'latin1');
    assert.equal(/(^|[^\r])\n/.test(txt), false, `${path.relative(RAIZ, f)} tiene saltos de linea LF sueltos`);
  }
});
