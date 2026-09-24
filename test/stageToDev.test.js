import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatosStageToDev, descubrirStageToDev, medirStageToDev, RAMA_STAGE_POR_DEFECTO } from '../src/stageToDev.js';

const CARPETA = '/Api/DB_Migrations';
const US = `${CARPETA}/Sprint_2026_09_02/US-25155_Tipo_De_Publicacion_MELI_Producto`;
const PRE1 = `${US}/[U-25155] - PRE - 01 - Columna ListingTypeMELI en Producto - ALTER.sql`;
const PRE2 = `${US}/[U-25155] - PRE - 02 - ListingTypeMELI en SP_GetProducts_ML - ALTER.sql`;
const PRE3 = `${US}/[U-25155] - PRE - 03 - ListingTypeMELI en SP_GetVariants_ML - ALTER.sql`;

// La diferencia real entre dev y master del 2026-09-24: un hotfix de MELI que entro directo a
// stage, con sus dos respaldos __OLD.
const CAMBIOS_REALES = [
  { changeType: 'edit', item: { path: CARPETA, isFolder: true } },
  { changeType: 'add', item: { path: US, isFolder: true } },
  { changeType: 'add', item: { path: `${US}/SP_GetProducts_ML__OLD.sql` } },
  { changeType: 'add', item: { path: `${US}/SP_GetVariants_ML__OLD.sql` } },
  { changeType: 'add', item: { path: PRE1 } },
  { changeType: 'add', item: { path: PRE2 } },
  { changeType: 'add', item: { path: PRE3 } },
];

test('la rama de stage en Api.Net es master', () => {
  assert.equal(RAMA_STAGE_POR_DEFECTO, 'master');
});

test('de la diferencia real quedan los 3 PRE: sin carpetas ni respaldos __OLD', () => {
  assert.deepEqual(candidatosStageToDev(CAMBIOS_REALES, CARPETA), [PRE1, PRE2, PRE3]);
});

test('un script EDITADO en stage tambien hay que correrlo en dev', () => {
  const editado = `${CARPETA}/Sprint_2026_09_01/US-1/[U-1] - 01 - x - ALTER.sql`;
  assert.deepEqual(candidatosStageToDev([{ changeType: 'edit', item: { path: editado } }], CARPETA), [editado]);
});

test('lo borrado, lo de fuera de DB_Migrations y lo que no es .sql no entra', () => {
  const cambios = [
    { changeType: 'delete', item: { path: `${CARPETA}/S/US-1/borrado.sql` } },
    { changeType: 'add', item: { path: '/Api/WebApp/Web.config' } },
    { changeType: 'add', item: { path: '/Api/Otro/script.sql' } },
    { changeType: 'add', item: { path: `${CARPETA}/S/US-1/leeme.txt` } },
    { changeType: 'edit, rename', item: { path: `${CARPETA}/S/US-1/renombrado.sql` } },
  ];
  assert.deepEqual(candidatosStageToDev(cambios, CARPETA), [`${CARPETA}/S/US-1/renombrado.sql`]);
});

test('sin cambios, sin candidatos', () => {
  assert.deepEqual(candidatosStageToDev([], CARPETA), []);
  assert.deepEqual(candidatosStageToDev(undefined, CARPETA), []);
});

function adoFalso(extra = {}) {
  const llamadas = { diff: [], descargas: [], commits: [] };
  return {
    llamadas,
    diffEntreRamas: async (repo, base, target) => { llamadas.diff.push({ repo, base, target }); return CAMBIOS_REALES; },
    descargarArchivo: async (repo, ruta, rama) => {
      llamadas.descargas.push({ ruta, rama });
      if (extra.fallaAl === ruta) throw new Error('no se pudo bajar');
      return Buffer.from('ALTER TABLE [dbo].[Producto] ADD [ListingTypeMELI] NVARCHAR(50) NULL', 'utf8');
    },
    ultimoCommitDe: async (repo, ruta, rama) => { llamadas.commits.push(rama); return { nombre: 'Federico Mari', email: 'federico.mari@trizap.net', fecha: '2026-09-23' }; },
  };
}

test('compara dev contra master y baja cada script DESDE master', async () => {
  const ado = adoFalso();
  const scripts = await descubrirStageToDev(ado, {});
  assert.deepEqual(ado.llamadas.diff, [{ repo: 'Api.Net', base: 'dev', target: 'master' }]);
  assert.equal(scripts.length, 3);
  assert.ok(ado.llamadas.descargas.every((d) => d.rama === 'master'));
  assert.ok(ado.llamadas.commits.every((r) => r === 'master'));
  assert.ok(scripts.every((s) => s.esPre));
  assert.ok(scripts.every((s) => s.wiId === 25155));
  assert.equal(scripts[0].responsables.commiteoEnElRepo.nombre, 'Federico Mari');
});

test('un archivo que no se pudo bajar queda como script sin veredicto, no tumba el resto', async () => {
  const scripts = await descubrirStageToDev(adoFalso({ fallaAl: PRE2 }), {});
  assert.equal(scripts.length, 3);
  const ilegible = scripts.find((s) => s.archivo && s.archivo.includes('PRE - 02'));
  assert.equal(ilegible.sondas[0].tipo, 'sin_sonda');
  assert.equal(ilegible.esPre, true);
});

test('las ramas se pueden cambiar sin tocar codigo', async () => {
  const ado = adoFalso();
  await descubrirStageToDev(ado, { ramaStage: 'stage-nueva', ramaDev: 'develop' });
  assert.deepEqual(ado.llamadas.diff, [{ repo: 'Api.Net', base: 'develop', target: 'stage-nueva' }]);
});

test('mide cada candidato en dev y en stage', async () => {
  const medidos = [];
  const r = await medirStageToDev(adoFalso(), {}, {
    medirAmbiente: async (scripts, amb) => {
      medidos.push(amb);
      return Object.fromEntries(scripts.map((s) => [s.id, { estado: amb === 'stage' ? 'OK' : 'FALTA' }]));
    },
  });
  assert.deepEqual(medidos, ['dev', 'stage']);
  assert.equal(r.ramaStage, 'master');
  assert.equal(r.ramaDev, 'dev');
  assert.equal(r.scripts.length, 3);
  for (const s of r.scripts) assert.deepEqual(r.estados[s.id], { dev: { estado: 'FALTA' }, stage: { estado: 'OK' } });
});
