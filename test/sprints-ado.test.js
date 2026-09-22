import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintsDisponibles } from '../src/sprints-ado.js';

const B = String.fromCharCode(92);
const nodo = (...p) => B + p.join(B);

function adoFalso(extra = {}) {
  return {
    listarIteraciones: async () => ([
      { nombre: '2026 Septiembre 2', ruta: nodo('Fidel', 'Iteration', '2026', '2026 Septiembre 2'), inicio: '2026-09-15', fin: '2026-09-28' },
      { nombre: '2026 Agosto 1', ruta: nodo('Fidel', 'Iteration', '2026', '2026 Agosto 1'), inicio: '2026-08-01', fin: '2026-08-14' },
    ]),
    listarArchivos: async () => ([
      { ruta: '/Api/DB_Migrations/Sprint_2026_08_01/US-1/a.sql', esCarpeta: false },
      { ruta: '/Api/DB_Migrations/Sprint_2026_09_02/US-2/b.sql', esCarpeta: false },
      { ruta: '/Api/DB_Migrations/Sprint_2026_09_02/US-3/c.sql', esCarpeta: false },
    ]),
    ...extra,
  };
}

test('el sprint mas nuevo va primero: es el que se viene a mirar', async () => {
  const r = await sprintsDisponibles({}, { ado: adoFalso() });
  assert.equal(r.iteraciones[0].nombre, '2026 Septiembre 2');
});

test('cada iteracion trae ya emparejada la carpeta del repo', async () => {
  const r = await sprintsDisponibles({}, { ado: adoFalso() });
  assert.equal(r.iteraciones[0].carpeta, 'Sprint_2026_09_02');
});

test('la ruta llega en el formato del work item, sin el nodo Iteration', async () => {
  const r = await sprintsDisponibles({}, { ado: adoFalso() });
  assert.equal(r.iteraciones[0].ruta, ['Fidel', '2026', '2026 Septiembre 2'].join(B));
});

test('las carpetas son las que EXISTEN en el repo, sin repetir', async () => {
  const r = await sprintsDisponibles({}, { ado: adoFalso() });
  assert.deepEqual(r.carpetas, ['Sprint_2026_09_02', 'Sprint_2026_08_01']);
});

test('si no se pueden leer las carpetas, las iteraciones llegan igual y se avisa', async () => {
  const ado = adoFalso({ listarArchivos: async () => { throw new Error('403'); } });
  const r = await sprintsDisponibles({}, { ado });
  assert.equal(r.iteraciones.length, 2, 'las iteraciones no dependen del repo');
  assert.deepEqual(r.carpetas, []);
  assert.match(r.nota, /403/);
  assert.match(r.nota, /comparar contra el repo/i);
});

test('una iteracion que no sigue el patron llega sin carpeta sugerida, no con una inventada', async () => {
  const ado = adoFalso({
    listarIteraciones: async () => ([{ nombre: 'Backlog', ruta: nodo('Fidel', 'Iteration', 'Backlog'), inicio: null, fin: null }]),
  });
  const r = await sprintsDisponibles({}, { ado });
  assert.equal(r.iteraciones[0].carpeta, null);
});

test('un archivo suelto en la raiz de DB_Migrations no se cuenta como sprint', async () => {
  const ado = adoFalso({
    listarArchivos: async () => ([
      { ruta: '/Api/DB_Migrations/[LEER] Convencion.txt', esCarpeta: false },
      { ruta: '/Api/DB_Migrations/Sprint_2026_09_02/US-2/b.sql', esCarpeta: false },
    ]),
  });
  const r = await sprintsDisponibles({}, { ado });
  assert.deepEqual(r.carpetas, ['Sprint_2026_09_02']);
});

test('el sprint EN CURSO es el que contiene hoy, no el ultimo creado en Azure', async () => {
  const ado = adoFalso({
    listarIteraciones: async () => ([
      { nombre: 'futuro', ruta: nodo('Fidel', '2026', '2026 Diciembre 3'), inicio: '2026-12-21', fin: '2027-01-03' },
      { nombre: 'ahora', ruta: nodo('Fidel', '2026', '2026 Septiembre 2'), inicio: '2026-09-15', fin: '2026-09-28' },
    ]),
  });
  const r = await sprintsDisponibles({}, { ado, hoy: '2026-09-22' });
  assert.equal(r.actual.nombre, 'ahora');
  assert.equal(r.iteraciones[0].nombre, 'futuro', 'el orden por fecha no cambia');
});

test('si ningun sprint contiene hoy, actual es null en vez de uno cualquiera', async () => {
  const r = await sprintsDisponibles({}, { ado: adoFalso(), hoy: '2030-01-01' });
  assert.equal(r.actual, null);
});

test('el primer y el ultimo dia del sprint cuentan como adentro', async () => {
  const ado = adoFalso({
    listarIteraciones: async () => ([{ nombre: 'x', ruta: nodo('Fidel', '2026', '2026 Septiembre 2'), inicio: '2026-09-15', fin: '2026-09-28' }]),
  });
  assert.equal((await sprintsDisponibles({}, { ado, hoy: '2026-09-15' })).actual.nombre, 'x');
  assert.equal((await sprintsDisponibles({}, { ado, hoy: '2026-09-28' })).actual.nombre, 'x');
  assert.equal((await sprintsDisponibles({}, { ado, hoy: '2026-09-29' })).actual, null);
});
