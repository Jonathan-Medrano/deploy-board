import test from 'node:test';
import assert from 'node:assert/strict';
import { medirUnRepo, medirRepos } from '../src/repos/medir.js';

function adoFalso({ repos = [], ramas = {}, pendientes = {}, activos = {}, fallaRamas = [], fallaDiff = [] } = {}) {
  const llamadas = { commits: [] };
  return {
    llamadas,
    listarRepos: async () => repos,
    listarRamas: async (r) => { if (fallaRamas.includes(r)) throw new Error(`403 en ${r}`); return ramas[r] || []; },
    contarPendientes: async (r) => { if (fallaDiff.includes(r)) throw new Error(`500 en ${r}`); return pendientes[r] || 0; },
    commitsPendientes: async (r, o, d, top) => {
      llamadas.commits.push({ r, o, d, top });
      return [{ id: 'aaaa1111', mensaje: 'feat: x', autor: 'Ana', fecha: '2026-10-01' }];
    },
    prsActivos: async (r) => activos[r] || [],
    urlDePr: (r, id) => `https://ado/${r}/pullrequest/${id}`,
  };
}

const TRES = ['dev', 'stage', 'main'];

test('un repo sin cambios no pide la lista de commits', async () => {
  const ado = adoFalso();
  const f = await medirUnRepo(ado, { repo: 'R', ramas: { dev: 'dev', stage: 'stage', main: 'main' }, par: 'stage-main' });
  assert.deepEqual(f, { repo: 'R', ramas: { origen: 'stage', destino: 'main' }, pendientes: 0, ultimo: null, commits: [], prActivo: null, error: null });
  assert.equal(ado.llamadas.commits.length, 0);
});

test('con cambios trae hasta 50 commits y el ultimo es el primero de la lista', async () => {
  const ado = adoFalso({ pendientes: { R: 3 } });
  const f = await medirUnRepo(ado, { repo: 'R', ramas: { dev: 'develop', stage: 'stage', main: 'main' }, par: 'dev-stage' });
  assert.equal(f.pendientes, 3);
  assert.equal(f.ultimo.autor, 'Ana');
  assert.deepEqual(ado.llamadas.commits, [{ r: 'R', o: 'develop', d: 'stage', top: 50 }]);
});

test('con varios PR activos se muestra el mas nuevo, con link', async () => {
  const ado = adoFalso({ pendientes: { R: 1 }, activos: { R: [{ id: 10, titulo: 'viejo' }, { id: 12, titulo: 'StageToDev' }] } });
  const f = await medirUnRepo(ado, { repo: 'R', ramas: { dev: 'dev', stage: 'stage', main: 'main' }, par: 'stage-dev' });
  assert.deepEqual(f.prActivo, { id: 12, titulo: 'StageToDev', link: 'https://ado/R/pullrequest/12' });
});

test('un repo que falla al medir devuelve su error en la fila', async () => {
  const ado = adoFalso({ fallaDiff: ['R'] });
  const f = await medirUnRepo(ado, { repo: 'R', ramas: { dev: 'dev', stage: 'stage', main: 'main' }, par: 'stage-main' });
  assert.equal(f.error, '500 en R');
  assert.equal(f.pendientes, 0);
});

test('medirRepos deja afuera deshabilitados y repos sin las tres puntas, y ordena', async () => {
  const ado = adoFalso({
    repos: [
      { nombre: 'Zeta', deshabilitado: false }, { nombre: 'Alfa', deshabilitado: false },
      { nombre: 'Beta', deshabilitado: false }, { nombre: 'Cliente', deshabilitado: false },
      { nombre: 'Apagado', deshabilitado: true }, { nombre: 'Roto', deshabilitado: false },
      { nombre: 'Gamma', deshabilitado: false },
    ],
    ramas: { Zeta: TRES, Alfa: TRES, Beta: TRES, Cliente: ['master'], Apagado: TRES, Gamma: TRES },
    pendientes: { Zeta: 2, Beta: 9 },
    fallaRamas: ['Roto'],
    fallaDiff: ['Gamma'],
  });
  const filas = await medirRepos(ado, 'stage-main');
  assert.deepEqual(filas.map((f) => f.repo), ['Beta', 'Zeta', 'Gamma', 'Roto', 'Alfa']);
  assert.equal(filas.find((f) => f.repo === 'Roto').error, '403 en Roto');
  assert.equal(filas.find((f) => f.repo === 'Roto').ramas, null);
});

test('nunca hay mas de 4 repos en vuelo (8 llamadas: pendientes y PRs van juntas)', async () => {
  let enVuelo = 0, maximo = 0;
  const lento = async (v) => { enVuelo++; maximo = Math.max(maximo, enVuelo); await new Promise((r) => setTimeout(r, 5)); enVuelo--; return v; };
  const repos = Array.from({ length: 12 }, (_, i) => ({ nombre: `R${i}`, deshabilitado: false }));
  const ado = {
    listarRepos: async () => repos,
    listarRamas: () => lento(TRES),
    contarPendientes: () => lento(0),
    prsActivos: () => lento([]),
    commitsPendientes: async () => [],
    urlDePr: () => '',
  };
  await medirRepos(ado, 'dev-stage');
  assert.ok(maximo <= 8, `maximo ${maximo}`);
});

test('un par invalido se rechaza antes de llamar a Azure', async () => {
  const ado = adoFalso();
  ado.listarRepos = async () => { throw new Error('no deberia llamar'); };
  await assert.rejects(() => medirRepos(ado, 'main-dev'), /main-dev/);
});
