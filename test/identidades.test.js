import test from 'node:test';
import assert from 'node:assert/strict';
import { crearIdentidades } from '../src/identidades.js';

// Medido el 2026-09-24 sobre Api/DB_Migrations: la misma persona firma con dos nombres, y una
// cuenta compartida (camp@) aparece con el nombre de quien la uso ese dia.
const GIT = [
  { nombre: 'Juani Denipoti', email: 'juan.ignacio.denipoti@trizap.net' },
  { nombre: 'Juani Denipoti', email: 'juan.ignacio.denipoti@trizap.net' },
  { nombre: 'Juan Ignacio Denipoti', email: 'juan.ignacio.denipoti@trizap.net' },
  { nombre: 'Federico Mari', email: 'federico.mari@trizap.net' },
  { nombre: 'camp', email: 'camp@trizap.net' },
  { nombre: 'Trizap Camp', email: 'camp@trizap.net' },
  { nombre: 'Federico Mari', email: 'camp@trizap.net' },
  { nombre: 'Juani Denipoti', email: 'camp@trizap.net' },
];
const ADO = [{ nombre: 'Juan Ignacio Denipoti', email: 'Juan.Ignacio.Denipoti@trizap.net' }];

test('un autor de git con mail de Azure se nombra como en Azure', () => {
  const id = crearIdentidades({ ado: ADO, git: GIT });
  assert.equal(id.nombreDe({ nombre: 'Juani Denipoti', email: 'juan.ignacio.denipoti@trizap.net' }), 'Juan Ignacio Denipoti');
});

test('el mail se compara sin distinguir mayusculas', () => {
  const id = crearIdentidades({ ado: ADO, git: GIT });
  assert.equal(id.nombreDe({ nombre: 'x', email: 'JUAN.IGNACIO.DENIPOTI@TRIZAP.NET' }), 'Juan Ignacio Denipoti');
});

test('desde la cuenta compartida, un nombre que ya firmo con su mail propio vuelve a esa persona', () => {
  const id = crearIdentidades({ ado: ADO, git: GIT });
  assert.equal(id.nombreDe({ nombre: 'Juani Denipoti', email: 'camp@trizap.net' }), 'Juan Ignacio Denipoti');
  assert.equal(id.nombreDe({ nombre: 'Federico Mari', email: 'camp@trizap.net' }), 'Federico Mari');
});

test('desde la cuenta compartida, un nombre que no es de nadie queda sin responsable', () => {
  const id = crearIdentidades({ ado: ADO, git: GIT });
  assert.equal(id.nombreDe({ nombre: 'Trizap Camp', email: 'camp@trizap.net' }), null);
  assert.equal(id.nombreDe({ nombre: 'camp', email: 'camp@trizap.net' }), null);
});

test('sin Azure, un mail con dos nombres usa el que mas firmo', () => {
  const id = crearIdentidades({ ado: [], git: GIT });
  assert.equal(id.nombreDe({ nombre: 'Juan Ignacio Denipoti', email: 'juan.ignacio.denipoti@trizap.net' }), 'Juani Denipoti');
});

test('un nombre suelto que ya aparecio con un mail se une a esa persona', () => {
  const id = crearIdentidades({ ado: ADO, git: GIT });
  assert.equal(id.nombreDe({ nombre: 'Juani Denipoti' }), 'Juan Ignacio Denipoti');
  assert.equal(id.nombreDe({ nombre: '  juani denipoti ' }), 'Juan Ignacio Denipoti');
});

test('un apodo que nunca aparecio no se adivina', () => {
  const id = crearIdentidades({ ado: ADO, git: GIT });
  assert.equal(id.nombreDe({ nombre: 'Juani' }), 'Juani');
});

test('un mail suelto (el de RESPONSABLE_PROMOCION) se resuelve a su nombre', () => {
  const id = crearIdentidades({ ado: ADO, git: GIT });
  assert.equal(id.nombreDe({ email: 'juan.ignacio.denipoti@trizap.net' }), 'Juan Ignacio Denipoti');
});

test('un mail que nadie conoce se muestra tal cual antes que perderlo', () => {
  const id = crearIdentidades({ ado: ADO, git: GIT });
  assert.equal(id.nombreDe({ email: 'nuevo@trizap.net' }), 'nuevo@trizap.net');
  assert.equal(id.nombreDe({ nombre: 'Nuevo Dev', email: 'nuevo@trizap.net' }), 'Nuevo Dev');
});

test('sin datos devuelve null', () => {
  const id = crearIdentidades();
  assert.equal(id.nombreDe(null), null);
  assert.equal(id.nombreDe({}), null);
});

test('unificarPersonas deja un solo nombre por persona en work items, scripts y roles', async () => {
  const { unificarPersonas } = await import('../src/identidades.js');
  const wis = [{ id: 1, asignadoA: 'Juan Ignacio Denipoti', asignadoAEmail: 'juan.ignacio.denipoti@trizap.net' }];
  const scripts = [
    { id: 'a', responsables: { commiteoEnElRepo: { nombre: 'Juani Denipoti', email: 'juan.ignacio.denipoti@trizap.net', fecha: 'f' } } },
    { id: 'b', responsables: { commiteoEnElRepo: { nombre: 'Trizap Camp', email: 'camp@trizap.net', fecha: 'f' } } },
    { id: 'c', responsables: { subioElAdjunto: null } },
    { id: 'd', responsables: {} },
  ];
  const roles = unificarPersonas({ wis, scripts, roles: { promocion: 'juan.ignacio.denipoti@trizap.net', produccion: null }, autores: GIT });
  assert.equal(wis[0].asignadoA, 'Juan Ignacio Denipoti');
  assert.equal(scripts[0].responsables.commiteoEnElRepo.nombre, 'Juan Ignacio Denipoti');
  assert.equal(scripts[0].responsables.commiteoEnElRepo.fecha, 'f');
  assert.equal(scripts[1].responsables.commiteoEnElRepo.nombre, null);
  assert.deepEqual(roles, { promocion: 'Juan Ignacio Denipoti', produccion: null });
});

test('unificarPersonas deja un rol escrito como nombre tal cual si no lo conoce', async () => {
  const { unificarPersonas } = await import('../src/identidades.js');
  const roles = unificarPersonas({ wis: [], scripts: [], roles: { promocion: 'Juani', produccion: 'Equipo Deploy' }, autores: GIT });
  assert.deepEqual(roles, { promocion: 'Juani', produccion: 'Equipo Deploy' });
});

test('la cuenta compartida no es una persona aunque Azure la conozca', () => {
  const id = crearIdentidades({ ado: [...ADO, { nombre: 'Trizap Camp', email: 'camp@trizap.net' }], git: GIT });
  assert.equal(id.nombreDe({ nombre: 'Trizap Camp', email: 'camp@trizap.net' }), null);
  assert.equal(id.nombreDe({ nombre: 'Trizap Camp' }), null);
  assert.equal(id.nombreDe({ nombre: 'Juani Denipoti', email: 'camp@trizap.net' }), 'Juan Ignacio Denipoti');
});
