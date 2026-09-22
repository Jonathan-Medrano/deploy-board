import test from 'node:test';
import assert from 'node:assert/strict';
import { args, opcionesPorDefecto } from '../src/cli.js';

test('sin flags ni entorno, mide dev y stage promoviendo a stage', () => {
  const o = opcionesPorDefecto({});
  assert.deepEqual(o.ambientes, ['dev', 'stage']);
  assert.equal(o.destino, 'stage');
  assert.equal(o.sprint, undefined);
});

test('el .env alcanza: la consola mide lo mismo que el tablero sin repetir flags', () => {
  const o = args([], { DEPLOY_BOARD_SPRINT: 'Sprint_X', DEPLOY_BOARD_ITERACION: 'It', DEPLOY_BOARD_AMBIENTES: 'dev' });
  assert.equal(o.sprint, 'Sprint_X');
  assert.equal(o.iteracion, 'It');
  assert.deepEqual(o.ambientes, ['dev']);
});

test('un flag pisa al .env, para probar otro sprint sin editar el archivo', () => {
  const o = args(['--sprint', 'Sprint_Y'], { DEPLOY_BOARD_SPRINT: 'Sprint_X' });
  assert.equal(o.sprint, 'Sprint_Y');
});

test('--ambientes acepta espacios y descarta lo vacio', () => {
  assert.deepEqual(args(['--ambientes', 'dev, stage ,'], {}).ambientes, ['dev', 'stage']);
});

test('--json no viene prendido por accidente', () => {
  assert.equal(args([], {}).json, false);
  assert.equal(args(['--json'], {}).json, true);
});
