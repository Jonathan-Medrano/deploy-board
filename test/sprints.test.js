import test from 'node:test';
import assert from 'node:assert/strict';
import { carpetaSugerida, rutaDeIteracion, ordenarIteraciones } from '../src/sprints.js';

// La barra invertida se arma asi y no con un literal: los heredocs de esta plataforma se la
// comen, y un test que compara la ruta equivocada pasa igual sin probar nada.
const B = String.fromCharCode(92);
const iter = (...p) => p.join(B);

test('de la iteracion de Azure sale la carpeta del repo', () => {
  assert.equal(carpetaSugerida(iter('Fidel', '2026', '2026 Septiembre 2')), 'Sprint_2026_09_02');
});

test('el mes va con dos digitos, tambien en enero', () => {
  assert.equal(carpetaSugerida(iter('Fidel', '2026', '2026 Enero 1')), 'Sprint_2026_01_01');
});

test('los meses con acento y con mayusculas raras se reconocen igual', () => {
  assert.equal(carpetaSugerida(iter('Fidel', '2026', '2026 DICIEMBRE 2')), 'Sprint_2026_12_02');
  assert.equal(carpetaSugerida(iter('Fidel', '2026', '2026 marzo 1')), 'Sprint_2026_03_01');
});

test('una iteracion que no sigue el formato devuelve null en vez de una carpeta inventada', () => {
  assert.equal(carpetaSugerida(iter('Fidel', '2026', 'Backlog')), null);
  assert.equal(carpetaSugerida(''), null);
  assert.equal(carpetaSugerida(null), null);
});

test('el nodo de Azure trae "Iteration" en el medio y el work item no: se saca', () => {
  assert.equal(rutaDeIteracion(B + iter('Fidel', 'Iteration', '2026', '2026 Septiembre 2')),
               iter('Fidel', '2026', '2026 Septiembre 2'));
});

test('una ruta que ya viene sin "Iteration" se deja como esta', () => {
  assert.equal(rutaDeIteracion(B + iter('Fidel', '2026', '2026 Septiembre 2')),
               iter('Fidel', '2026', '2026 Septiembre 2'));
});

test('las iteraciones se ordenan de la mas nueva a la mas vieja', () => {
  const r = ordenarIteraciones([
    { nombre: 'A', inicio: '2026-01-01' },
    { nombre: 'C', inicio: '2026-09-01' },
    { nombre: 'B', inicio: '2026-05-01' },
  ]);
  assert.deepEqual(r.map((x) => x.nombre), ['C', 'B', 'A']);
});

test('una iteracion sin fecha va al final, no arriba de todo por ser vacia', () => {
  const r = ordenarIteraciones([
    { nombre: 'sinFecha', inicio: null },
    { nombre: 'conFecha', inicio: '2020-01-01' },
  ]);
  assert.deepEqual(r.map((x) => x.nombre), ['conFecha', 'sinFecha']);
});
