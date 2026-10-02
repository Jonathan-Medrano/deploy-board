import test from 'node:test';
import assert from 'node:assert/strict';
import { PARES, esParValido, ramasDelRepo, ramasDelPar, tituloDelPar } from '../src/repos/ramas.js';

test('los cuatro esquemas medidos el 2026-10-02 se detectan', () => {
  assert.deepEqual(ramasDelRepo(['dev', 'stage', 'main']), { dev: 'dev', stage: 'stage', main: 'main' });
  assert.deepEqual(ramasDelRepo(['develop', 'stage', 'main', 'feature/x']), { dev: 'develop', stage: 'stage', main: 'main' });
  assert.deepEqual(ramasDelRepo(['dev', 'master', 'main']), { dev: 'dev', stage: 'master', main: 'main' });
  assert.deepEqual(ramasDelRepo(['dev', 'stage', 'master', 'main']), { dev: 'dev', stage: 'stage', main: 'main' });
});

test('un repo sin alguna de las tres puntas no aplica', () => {
  assert.equal(ramasDelRepo(['master']), null);
  assert.equal(ramasDelRepo(['dev', 'master']), null);
  assert.equal(ramasDelRepo(['main']), null);
  assert.equal(ramasDelRepo([]), null);
  assert.equal(ramasDelRepo(undefined), null);
});

test('cada par sale de las ramas reales del repo', () => {
  const api = { dev: 'dev', stage: 'master', main: 'main' };
  assert.deepEqual(ramasDelPar(api, 'dev-stage'), { origen: 'dev', destino: 'master' });
  assert.deepEqual(ramasDelPar(api, 'stage-main'), { origen: 'master', destino: 'main' });
  assert.deepEqual(ramasDelPar({ dev: 'develop', stage: 'stage', main: 'main' }, 'stage-dev'), { origen: 'stage', destino: 'develop' });
});

test('los titulos son los que usa el equipo, con nombre logico en todos los repos', () => {
  assert.equal(tituloDelPar('dev-stage'), 'DevToStage');
  assert.equal(tituloDelPar('stage-main'), 'StageToMain');
  assert.equal(tituloDelPar('stage-dev'), 'StageToDev');
  assert.deepEqual(Object.keys(PARES), ['dev-stage', 'stage-main', 'stage-dev']);
});

test('un par desconocido se rechaza', () => {
  assert.equal(esParValido('main-dev'), false);
  assert.equal(esParValido('toString'), false);
  assert.equal(esParValido('stage-main'), true);
  assert.throws(() => tituloDelPar('main-dev'), /main-dev/);
  assert.throws(() => ramasDelPar({ dev: 'dev', stage: 'stage', main: 'main' }, 'x'), /x/);
});
