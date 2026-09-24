import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaLocal } from '../src/fecha.js';

test('a las 22:00 de Argentina sigue siendo hoy, aunque en UTC ya sea manana', () => {
  assert.equal(fechaLocal(new Date('2026-09-29T01:00:00Z')), '2026-09-28');
});

test('a la manana coincide con UTC', () => {
  assert.equal(fechaLocal(new Date('2026-09-28T12:00:00Z')), '2026-09-28');
});
