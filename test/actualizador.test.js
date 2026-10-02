import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelRepo, traerCambios } from '../src/actualizador.js';

const ORIGEN = 'https://agenciap.visualstudio.com/Fidel/_git/FidelWorkSpace';
const CARPETA = 'Tools/Paneles/deploy-board/';
const SIEMPRE = () => true;
const traer = (deps) => traerCambios({ leerRegistro: () => null, escribirRegistro: () => {}, ...deps });

// El runner falso devuelve lo que devolveria git para cada comando. Asi se prueba el
// comportamiento sin depender de que la maquina tenga un remoto ni conexion. Por defecto, main
// tiene a.js (h1) y web/app.js (h2), y el disco tiene los dos iguales.
function git(respuestas = {}) {
  const corridos = [];
  const todas = {
    'remote get-url': ORIGEN,
    'fetch': '',
    'rev-parse --show-prefix': CARPETA,
    'rev-parse --short': 'abc123',
    'rev-parse --verify': 'arbol',
    'ls-tree': '100644 blob h1\ta.js\u0000100644 blob h2\tweb/app.js\u0000',
    'hash-object': 'h1\nh2',
    'ls-files': 'a.js\u0000web/app.js\u0000',
    'restore': '',
    'rev-parse origin/main': 'arbolMain',
    'log': '',
    'status': '',
    ...respuestas,
  };
  return {
    corridos,
    correr: (cmd, args) => {
      const s = args.join(' ');
      corridos.push(s);
      const clave = Object.keys(todas).filter((k) => s.startsWith(k)).sort((a, b) => b.length - a.length)[0];
      if (clave === undefined) throw new Error('comando no esperado: ' + s);
      const r = todas[clave];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

test('al dia: la carpeta es igual a la de main', () => {
  const r = estadoDelRepo({ correr: git().correr, existe: SIEMPRE });
  assert.equal(r.hayCambios, false);
  assert.equal(r.detras, 0);
  assert.equal(r.nota, null);
});

test('atrasado: informa CUANTOS archivos cambian, no solo que falta algo', () => {
  const r = estadoDelRepo({ correr: git({ 'hash-object': 'otro\notro2' }).correr, existe: SIEMPRE });
  assert.equal(r.hayCambios, true);
  assert.equal(r.detras, 2);
});

test('compara SOLO la carpeta del sistema contra origin/main, no la rama en la que este la copia', () => {
  const g = git();
  estadoDelRepo({ correr: g.correr, existe: SIEMPRE });
  assert.ok(g.corridos.includes('fetch --quiet origin main'), g.corridos.join(' | '));
  assert.ok(g.corridos.includes('ls-tree -r -z origin/main -- .'), g.corridos.join(' | '));
  assert.equal(g.corridos.some((c) => c.startsWith('pull')), false, 'no tiene que hacer pull del repo entero');
});

test('identico por contenido aunque la rama no tenga la carpeta commiteada: no hay version nueva', () => {
  const r = estadoDelRepo({ correr: git({ 'ls-files': '' }).correr, existe: SIEMPRE });
  assert.equal(r.hayCambios, false);
});

test('un archivo que main tiene y el disco no, cuenta como cambio', () => {
  const r = estadoDelRepo({ correr: git({ 'hash-object': 'h2' }).correr, existe: (ruta) => ruta !== 'a.js' });
  assert.deepEqual(r.archivos, ['a.js']);
});

test('un archivo que main borro y la rama todavia tiene commiteado, cuenta como cambio', () => {
  const r = estadoDelRepo({ correr: git({ 'ls-files': 'a.js\u0000web/app.js\u0000viejo.js\u0000' }).correr, existe: SIEMPRE });
  assert.deepEqual(r.archivos, ['viejo.js']);
});

test('sin red el fetch falla y se sigue con lo que hay', () => {
  const r = estadoDelRepo({ correr: git({ 'fetch': new Error('could not resolve host') }).correr, existe: SIEMPRE });
  assert.equal(r.hayCambios, false);
  assert.match(r.nota, /no pude/i);
});

test('si main todavia no tiene la carpeta, NO se restaura: borraria el sistema', () => {
  const g = git({ 'rev-parse --verify': new Error('fatal: path does not exist'), 'hash-object': 'otro\notro2' });
  const r = traer({ correr: g.correr, existe: SIEMPRE });
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /todavia no esta publicado/i);
  assert.equal(g.corridos.some((c) => c.startsWith('restore')), false);
});

test('traer cambios restaura solo la carpeta desde main, sin tocar el indice', () => {
  const g = git({ 'hash-object': 'otro\nh2' });
  const r = traer({ correr: g.correr, existe: SIEMPRE });
  assert.equal(r.ok, true);
  assert.equal(r.reiniciar, true);
  assert.ok(g.corridos.includes('restore --source=origin/main --worktree -- .'), g.corridos.join(' | '));
});

test('si la carpeta ya es igual a main, no se restaura ni se reinicia', () => {
  const g = git();
  const r = traer({ correr: g.correr, existe: SIEMPRE });
  assert.equal(r.ok, true);
  assert.equal(r.reiniciar, false);
  assert.equal(g.corridos.some((c) => c.startsWith('restore')), false);
});

test('un restore que falla devuelve el error de git, no un exito silencioso', () => {
  const g = git({ 'hash-object': 'otro\nh2', 'restore': new Error('unable to unlink old file') });
  const r = traer({ correr: g.correr, existe: SIEMPRE });
  assert.equal(r.ok, false);
  assert.equal(r.reiniciar, false);
  assert.match(r.mensaje, /unlink/);
});

test('una copia cuyo origin no es FidelWorkSpace es la de DESARROLLO, no una instalacion rota', () => {
  const g = git({ 'remote get-url': 'https://github.com/x/IA-JONA.git' });
  const r = estadoDelRepo({ correr: g.correr, existe: SIEMPRE });
  assert.equal(r.esDesarrollo, true);
  assert.equal(r.hayCambios, false);
  assert.match(r.nota, /desarrollo/i);
  assert.equal(g.corridos.some((c) => c.startsWith('fetch')), false, 'no tiene que ir a la red');
});

test('la copia de desarrollo no se pisa a si misma con traer cambios', () => {
  const g = git({ 'remote get-url': 'https://github.com/x/IA-JONA.git' });
  const r = traer({ correr: g.correr, existe: SIEMPRE });
  assert.equal(r.esDesarrollo, true);
  assert.equal(g.corridos.some((c) => c.startsWith('restore')), false);
});

test('una carpeta que no salio de un clone lo dice', () => {
  const r = estadoDelRepo({ correr: git({ 'remote get-url': new Error('no such remote') }).correr, existe: SIEMPRE });
  assert.match(r.nota, /clone/i);
});

test('cambios sin commitear en la carpeta (por ejemplo publicar.mjs antes del PR): no se pisan', () => {
  const g = git({ 'status': ' M src/a.js', 'hash-object': 'local\nh2' });
  const r = traer({ correr: g.correr, existe: SIEMPRE, leerRegistro: () => null, escribirRegistro: () => {} });
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /sin commitear/i);
  assert.equal(g.corridos.some((c) => c.startsWith('restore')), false);
});

test('una rama atrasada que el sistema ya actualizo antes NO cuenta como trabajo local', () => {
  const g = git({
    'status': ' M src/a.js',
    'ls-tree -r -z origin/main': '100644 blob m1\ta.js\u0000100644 blob m2\tweb/app.js\u0000',
    'ls-tree -r -z --full-tree arbolViejo': '100644 blob h1\ta.js\u0000100644 blob h2\tweb/app.js\u0000',
  });
  let escrito = null;
  const r = traer({ correr: g.correr, existe: SIEMPRE, leerRegistro: () => 'arbolViejo', escribirRegistro: (a) => { escrito = a; } });
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.reiniciar, true);
  assert.equal(escrito, 'arbolMain', 'recuerda la version que dejo');
});

test('una rama con commits propios del sistema que main no tiene abre esa version', () => {
  const g = git({ 'log': 'abc123 fix(deploy-board): algo', 'hash-object': 'otro\notro2' });
  const r = traer({ correr: g.correr, existe: SIEMPRE });
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /cambios propios/i);
  assert.equal(g.corridos.some((c) => c.startsWith('restore')), false);
});

test('primera vez en una rama sin la carpeta y sin registro: se actualiza', () => {
  const g = git({ 'rev-parse --verify --quiet HEAD': new Error('no existe'), 'status': '?? src/', 'hash-object': 'otro\nh2' });
  const r = traer({ correr: g.correr, existe: SIEMPRE, leerRegistro: () => null, escribirRegistro: () => {} });
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.reiniciar, true);
});

test('al dia tambien deja registrada la version, para reconocerla despues', () => {
  let escrito = null;
  traer({ correr: git().correr, existe: SIEMPRE, escribirRegistro: (a) => { escrito = a; } });
  assert.equal(escrito, 'arbolMain');
});

// El equipo tiene el panel clonado del repo publico Jonathan-Medrano/deploy-board, donde el
// sistema es el repo entero: ahi se actualiza con pull, como antes de la carpeta de FidelWorkSpace.
const PROPIO = 'https://github.com/Jonathan-Medrano/deploy-board.git';

test('repo propio: compara contra su upstream y dice cuantos commits faltan', () => {
  const g = git({ 'remote get-url': PROPIO, 'rev-list --left-right --count': '3\t0' });
  const r = estadoDelRepo({ correr: g.correr });
  assert.equal(r.esDesarrollo, undefined);
  assert.equal(r.hayCambios, true);
  assert.equal(r.detras, 3);
  assert.equal(r.nota, null);
  assert.ok(g.corridos.includes('fetch --quiet'), g.corridos.join(' | '));
  assert.ok(!g.corridos.some((c) => c.startsWith('restore')), 'no restaura carpetas en el repo propio');
});

test('repo propio al dia: no hay cambios', () => {
  const r = estadoDelRepo({ correr: git({ 'remote get-url': PROPIO, 'rev-list --left-right --count': '0\t0' }).correr });
  assert.equal(r.hayCambios, false);
  assert.equal(r.nota, null);
});

test('repo propio sin red: abre igual con lo que hay', () => {
  const r = estadoDelRepo({ correr: git({ 'remote get-url': PROPIO, 'fetch': new Error('sin red') }).correr });
  assert.equal(r.hayCambios, false);
  assert.match(r.nota, /sin red/);
});

test('repo propio: traer hace pull --ff-only y pide reiniciar si cambio el commit', () => {
  let head = 'aaa';
  const g = git({ 'remote get-url': PROPIO, 'rev-list --left-right --count': '2\t0' });
  const correr = (cmd, args) => {
    const s = args.join(' ');
    if (s === 'rev-parse HEAD') return head;
    if (s === 'pull --ff-only') { g.corridos.push(s); head = 'bbb'; return 'Fast-forward'; }
    return g.correr(cmd, args);
  };
  const r = traer({ correr });
  assert.equal(r.ok, true);
  assert.equal(r.reiniciar, true);
  assert.ok(g.corridos.includes('pull --ff-only'));
});

test('repo propio con cambios locales: el pull falla y no se mezcla nada', () => {
  const g = git({ 'remote get-url': PROPIO, 'rev-list --left-right --count': '2\t0', 'pull --ff-only': new Error('Not possible to fast-forward') });
  const correr = (cmd, args) => (args.join(' ') === 'rev-parse HEAD' ? 'aaa' : g.correr(cmd, args));
  const r = traer({ correr });
  assert.equal(r.ok, false);
  assert.equal(r.reiniciar, false);
  assert.match(r.mensaje, /fast-forward/);
});

test('el repo de desarrollo IA-JONA sigue siendo copia de desarrollo', () => {
  const r = estadoDelRepo({ correr: git({ 'remote get-url': 'https://github.com/Jonathan-Medrano/IA-JONA.git' }).correr });
  assert.equal(r.esDesarrollo, true);
});
