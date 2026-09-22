import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { descubrirRepo } from '../../src/fuentes/repo.js';

const DIR = path.join(import.meta.dirname, '..', 'fixtures', 'repo');

// TODOS los tests inyectan git. Sin esto, descubrirRepo cae al execFileSync real y la suite
// pasa a depender de que git este en el PATH y del estado de commit de los fixtures: se
// comporta distinto en otra maquina y nadie entiende por que. El gancho existe justo para
// esto, asi que no usarlo en 5 de 7 tests dejaba el diseno sin cumplir su propio objetivo.
const SIN_GIT = { correr: () => '' };

test('lee los scripts de la carpeta del sprint', () => {
  const s = descubrirRepo(DIR, 'Sprint_2026_09_01', SIN_GIT);
  assert.equal(s.length, 2);
  assert.ok(s.every((x) => x.fuente === 'repo'));
  assert.ok(s.every((x) => x.wiId === 24322));
});

test('los __OLD y __NEW no cuentan: son copias de referencia', () => {
  const s = descubrirRepo(DIR, 'Sprint_2026_09_01', SIN_GIT);
  assert.equal(s.some((x) => /__OLD/.test(x.archivo)), false);
});

test('trae objetos y sondas ya derivadas', () => {
  const s = descubrirRepo(DIR, 'Sprint_2026_09_01', SIN_GIT);
  const col = s.find((x) => x.objetos.some((o) => o.tipo === 'COLUMN'));
  assert.ok(col);
  assert.equal(col.sondas[0].tipo, 'columna');
});

test('el id es estable entre corridas', () => {
  const a = descubrirRepo(DIR, 'Sprint_2026_09_01', SIN_GIT).map((x) => x.id).sort();
  const b = descubrirRepo(DIR, 'Sprint_2026_09_01', SIN_GIT).map((x) => x.id).sort();
  assert.deepEqual(a, b);
});

test('un sprint inexistente devuelve lista vacia, no rompe', () => {
  assert.deepEqual(descubrirRepo(DIR, 'Sprint_1999_01_01', SIN_GIT), []);
});

test('registra quien commiteo el script', () => {
  const s = descubrirRepo(DIR, 'Sprint_2026_09_01', {
    correr: () => 'Ana Maria Gonzalez\t2026-09-17\n',
  });
  assert.deepEqual(s[0].responsables.commiteoEnElRepo, { nombre: 'Ana Maria Gonzalez', fecha: '2026-09-17' });
});

test('si git falla el barrido sigue, sin nombre', () => {
  const s = descubrirRepo(DIR, 'Sprint_2026_09_01', {
    correr: () => { throw new Error('not a git repository'); },
  });
  assert.equal(s.length, 2);
  assert.equal(s[0].responsables.commiteoEnElRepo, null);
});

test('un archivo ilegible es UN script en ?, no un barrido caido', () => {
  const s = descubrirRepo(DIR, 'Sprint_2026_09_01', {
    ...SIN_GIT,
    leerSql: () => { throw new Error('buffer corrupto'); },
  });
  assert.equal(s.length, 2, 'los demas scripts se siguen descubriendo');
});

test('un archivo ilegible conserva lo que dice su NOMBRE: no inventa D7 ni D11', () => {
  // El seam real es `deps.leerSql` (ver descubrirRepo): la consigna sugeria `leer`, pero esa
  // clave no existe aca y con ella el mock no pisa nada — cae al lector real y el test pasa
  // de casualidad sin probar el catch. No se inventa un seam nuevo, se usa el que ya esta.
  const s = descubrirRepo(DIR, 'Sprint_2026_09_01', {
    ...SIN_GIT,
    leerSql: () => { throw new Error('buffer corrupto'); },
  });
  assert.equal(s.length, 2, 'los demas scripts se siguen descubriendo');
  const uno = s.find((x) => x.esPre);
  assert.ok(uno, 'el PRE del nombre sobrevive al fallo de lectura');
  assert.equal(uno.wiId, 24322);
  assert.equal(uno.accion, 'ALTER');
  assert.equal(uno.sondas[0].tipo, 'sin_sonda');
});
