import test from 'node:test';
import assert from 'node:assert/strict';
import { crearProgreso, conProgreso, usaColor, segundos } from '../src/progreso.js';

function capturar(color = false) {
  const lineas = [];
  const p = crearProgreso({ escribir: (t) => lineas.push(t), color, ahora: () => new Date(2026, 8, 25, 9, 5, 3) });
  return { p, lineas };
}

let t = 0;
const reloj = () => t;

test('avisa que empieza a medir y que termino, con la duracion', async () => {
  const { p, lineas } = capturar();
  t = 0;
  await conProgreso(p, 'Sprint_A', async () => { t = 12300; return { bloqueantes: 0 }; }, { reloj });
  assert.match(lineas[0], /09:05:03 .*Midiendo Sprint_A\.\.\./);
  assert.match(lineas.at(-1), /Termino de medir Sprint_A en 12,3 s: listo para subir/);
});

test('si quedan bloqueantes lo dice al terminar, en amarillo y no en verde', async () => {
  const { p, lineas } = capturar(true);
  t = 0;
  await conProgreso(p, 'S', async () => ({ bloqueantes: 2 }), { reloj });
  assert.match(lineas.at(-1), /2 bloqueantes/);
  assert.ok(lineas.at(-1).includes('\x1b[33m'));
});

test('las etapas de la medicion se muestran mientras avanza', async () => {
  const { p, lineas } = capturar();
  await conProgreso(p, 'S', async (paso) => { paso('Consultando la base de dev'); return { bloqueantes: 0 }; }, { reloj });
  assert.ok(lineas.some((l) => l.includes('Consultando la base de dev')));
});

test('los avisos de la medicion tambien salen en la consola', async () => {
  const { p, lineas } = capturar();
  await conProgreso(p, 'S', async () => ({ bloqueantes: 0, avisos: ['No se midio stage'] }), { reloj });
  assert.ok(lineas.some((l) => l.includes('No se midio stage')));
});

test('si falla lo dice en rojo y el error sigue su camino', async () => {
  const { p, lineas } = capturar(true);
  await assert.rejects(conProgreso(p, 'S', async () => { throw new Error('sqlcmd no esta'); }, { reloj }), /sqlcmd/);
  assert.match(lineas.at(-1), /Fallo la medicion de S.*sqlcmd no esta/);
  assert.ok(lineas.at(-1).includes('\x1b[31m'));
});

test('sin terminal o con NO_COLOR no se escriben codigos de color', () => {
  assert.equal(usaColor({ isTTY: false }, {}), false);
  assert.equal(usaColor({ isTTY: true }, { NO_COLOR: '1' }), false);
  assert.equal(usaColor({ isTTY: true }, {}), true);
  const { p, lineas } = capturar(false);
  p.ok('x');
  assert.equal(lineas[0].includes('\x1b['), false);
});

test('la duracion se escribe con coma decimal', () => {
  assert.equal(segundos(1500), '1,5 s');
});
