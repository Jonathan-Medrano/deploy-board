import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearEnv, aplicarEnv } from '../src/entorno.js';

test('lee clave=valor', () => {
  assert.deepEqual(parsearEnv('A=1\nB=dos'), { A: '1', B: 'dos' });
});

test('los comentarios y las lineas vacias se ignoran', () => {
  assert.deepEqual(parsearEnv('# nada\n\nA=1\n   # otra\n'), { A: '1' });
});

test('el valor puede traer signos igual: solo parte en el PRIMERO', () => {
  assert.deepEqual(parsearEnv('URL=https://x/y?a=1&b=2'), { URL: 'https://x/y?a=1&b=2' });
});

test('las comillas envolventes se sacan, las de adentro no', () => {
  assert.deepEqual(parsearEnv('A="con espacios"\nB=\'simple\'\nC=di"ce"'), { A: 'con espacios', B: 'simple', C: 'di"ce"' });
});

test('un valor con backslashes queda intacto: las rutas de red y las iteraciones de ADO los usan', () => {
  const b = String.fromCharCode(92);
  assert.deepEqual(parsearEnv('IT=Fidel' + b + '2026' + b + '2026 Septiembre 2'), { IT: 'Fidel' + b + '2026' + b + '2026 Septiembre 2' });
});

test('el CRLF de un archivo guardado en Windows no se cuela en el valor', () => {
  assert.deepEqual(parsearEnv('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});

test('una linea sin igual se descarta en vez de crear una clave vacia', () => {
  assert.deepEqual(parsearEnv('esto no es nada\nA=1'), { A: '1' });
});

test('lo que ya esta en el entorno GANA: una variable de la terminal pisa al archivo', () => {
  const env = { A: 'de la terminal' };
  aplicarEnv(env, { A: 'del archivo', B: 'del archivo' });
  assert.deepEqual(env, { A: 'de la terminal', B: 'del archivo' });
});

test('una variable vacia en el entorno NO cuenta como puesta', () => {
  const env = { A: '' };
  aplicarEnv(env, { A: 'del archivo' });
  assert.equal(env.A, 'del archivo');
});
