import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelRepo, traerCambios } from '../src/actualizador.js';

// El runner falso devuelve lo que devolveria git para cada comando. Asi se prueba el
// comportamiento sin depender de que la maquina tenga un remoto ni conexion.
function git(respuestas) {
  const corridos = [];
  return {
    corridos,
    correr: (cmd, args) => {
      corridos.push(args.join(' '));
      const s = args.join(' ');
      if (s.startsWith('remote get-url') && !Object.keys(respuestas).some((k) => s.startsWith(k))) {
        return 'https://github.com/Jonathan-Medrano/deploy-board.git';
      }
      const clave = Object.keys(respuestas).find((k) => s.startsWith(k));
      if (!clave) throw new Error('comando no esperado: ' + args.join(' '));
      const r = respuestas[clave];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

test('al dia: no hay nada para traer', () => {
  const g = git({ 'fetch': '', 'rev-list': '0\t0', 'rev-parse': 'abc123' });
  const r = estadoDelRepo({ correr: g.correr });
  assert.equal(r.hayCambios, false);
  assert.equal(r.detras, 0);
});

test('atrasado: informa CUANTOS commits faltan, no solo que falta algo', () => {
  const g = git({ 'fetch': '', 'rev-list': '3\t0', 'rev-parse': 'abc123' });
  const r = estadoDelRepo({ correr: g.correr });
  assert.equal(r.hayCambios, true);
  assert.equal(r.detras, 3);
  assert.equal(r.adelante, 0);
});

test('con commits locales propios se avisa, porque un ff-only va a fallar', () => {
  const g = git({ 'fetch': '', 'rev-list': '2\t1', 'rev-parse': 'abc123' });
  const r = estadoDelRepo({ correr: g.correr });
  assert.equal(r.adelante, 1);
});

test('sin upstream NO es un error: el sistema anda igual, solo no se actualiza', () => {
  const g = git({ 'fetch': '', 'rev-list': new Error('no upstream configured'), 'rev-parse': 'abc' });
  const r = estadoDelRepo({ correr: g.correr });
  assert.equal(r.hayCambios, false);
  assert.match(r.nota, /upstream/i);
});

test('sin red el fetch falla y se sigue con lo que hay', () => {
  const g = git({ 'fetch': new Error('could not resolve host'), 'rev-list': '0\t0', 'rev-parse': 'abc' });
  const r = estadoDelRepo({ correr: g.correr });
  assert.equal(r.hayCambios, false);
  assert.match(r.nota, /no pude/i);
});

test('traer cambios usa ff-only: nunca mezcla el trabajo local de nadie sin avisar', () => {
  const g = git({ 'fetch': '', 'rev-parse': 'abc', 'pull': 'Updating abc..def' });
  traerCambios({ correr: g.correr });
  assert.ok(g.corridos.some((c) => c.includes('pull --ff-only')), 'falta --ff-only: ' + g.corridos.join(' | '));
});

test('si el commit cambio, hay que reiniciar para correr el codigo nuevo', () => {
  let n = 0;
  const g = { correr: (c, a) => {
    const s = a.join(' ');
    if (s.startsWith('rev-parse')) return n++ === 0 ? 'viejo' : 'nuevo';
    return '';
  } };
  const r = traerCambios({ correr: g.correr });
  assert.equal(r.ok, true);
  assert.equal(r.reiniciar, true);
});

test('si el commit quedo igual, no se reinicia por nada', () => {
  const g = { correr: (c, a) => (a.join(' ').startsWith('rev-parse') ? 'igual' : '') };
  const r = traerCambios({ correr: g.correr });
  assert.equal(r.reiniciar, false);
});

test('un pull que falla devuelve el error de git, no un exito silencioso', () => {
  const g = git({ 'fetch': '', 'rev-parse': 'abc', 'pull': new Error('Not possible to fast-forward') });
  const r = traerCambios({ correr: g.correr });
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /fast-forward/);
});

test('una copia cuyo origin no es el repo de distribucion es la de DESARROLLO, no una instalacion rota', () => {
  const g = git({ 'remote get-url': 'https://github.com/x/IA-JONA.git', 'rev-parse': 'abc' });
  const r = estadoDelRepo({ correr: g.correr });
  assert.equal(r.esDesarrollo, true);
  assert.equal(r.hayCambios, false);
  assert.match(r.nota, /desarrollo/i);
  assert.equal(g.corridos.some((c) => c.startsWith('fetch')), false, 'no tiene que ir a la red');
});

test('la copia de desarrollo no dice "no tenes remoto" a quien es dueno del remoto', () => {
  const g = git({ 'remote get-url': 'https://github.com/x/otro.git', 'rev-parse': 'abc' });
  assert.equal(/no tiene remoto|no salio de un clone/i.test(estadoDelRepo({ correr: g.correr }).nota), false);
});

test('una carpeta que no salio de un clone lo dice distinto que una rama sin upstream', () => {
  const sinOrigen = git({ 'remote get-url': new Error('no such remote'), 'fetch': '', 'rev-list': new Error('no upstream'), 'rev-parse': 'abc' });
  assert.match(estadoDelRepo({ correr: sinOrigen.correr }).nota, /clone/i);

  const conOrigen = git({ 'remote get-url': 'https://github.com/Jonathan-Medrano/deploy-board.git', 'fetch': '', 'rev-list': new Error('no upstream'), 'rev-parse': 'abc' });
  assert.match(estadoDelRepo({ correr: conOrigen.correr }).nota, /upstream/i);
});
