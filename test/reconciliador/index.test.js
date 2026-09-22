import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconciliar } from '../../src/reconciliador/index.js';

const s = (id, fuente, extra = {}) => ({ id, archivo: id, wiId: 1, esPre: false, orden: null, objetos: [], sondas: [], sql: '', fuente, ...extra });

test('el mismo script en las dos fuentes se fusiona en uno', () => {
  const r = reconciliar({ adjuntos: [s('1/a', 'adjunto')], repo: [s('1/a', 'repo')] });
  assert.equal(r.length, 1);
  assert.deepEqual([...r[0].fuentes].sort(), ['adjunto', 'repo']);
});

test('solo en el repo: queda con una sola fuente (dispara D5)', () => {
  const r = reconciliar({ adjuntos: [], repo: [s('1/a', 'repo')] });
  assert.deepEqual(r[0].fuentes, ['repo']);
});

test('solo adjunto: queda con una sola fuente (dispara D6)', () => {
  const r = reconciliar({ adjuntos: [s('1/a', 'adjunto')], repo: [] });
  assert.deepEqual(r[0].fuentes, ['adjunto']);
});

test('el adjunto manda para el contenido: es lo que se sube al FileZilla', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { sql: 'ADJUNTO' })],
    repo: [s('1/a', 'repo', { sql: 'REPO' })],
  });
  assert.equal(r[0].sql, 'ADJUNTO');
});

test('el campo fuente singular desaparece del resultado', () => {
  const r = reconciliar({ adjuntos: [s('1/a', 'adjunto')], repo: [] });
  assert.equal('fuente' in r[0], false);
});

test('conserva las DOS numeraciones por separado, para que D10 pueda compararlas', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { orden: 2 })],
    repo: [s('1/a', 'repo', { orden: 1 })],
  });
  assert.deepEqual(r[0].ordenPorFuente, { adjunto: 2, repo: 1 });
});

test('acumula el responsable de cada fuente: son personas distintas', () => {
  const r = reconciliar({
    adjuntos: [s('1/a', 'adjunto', { responsables: { subioElAdjunto: { nombre: 'Ana', fecha: '2026-09-17' } } })],
    repo: [s('1/a', 'repo', { responsables: { commiteoEnElRepo: { nombre: 'Emi', fecha: '2026-09-15' } } })],
  });
  assert.equal(r[0].responsables.subioElAdjunto.nombre, 'Ana');
  assert.equal(r[0].responsables.commiteoEnElRepo.nombre, 'Emi');
});

test('ordena por PRE primero, despues por wiId y orden', () => {
  const r = reconciliar({
    adjuntos: [
      s('2/b', 'adjunto', { wiId: 2, orden: 2 }),
      s('2/a', 'adjunto', { wiId: 2, orden: 1 }),
      s('9/z', 'adjunto', { wiId: 9, esPre: true }),
    ],
    repo: [],
  });
  assert.deepEqual(r.map((x) => x.id), ['9/z', '2/a', '2/b']);
});
