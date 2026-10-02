import test from 'node:test';
import assert from 'node:assert/strict';
import { crearPrDePromocion } from '../src/repos/promover.js';

function ado({ ramas = ['dev', 'master', 'main'], pendientes = 2, activos = [] } = {}) {
  return {
    listarRamas: async () => ramas,
    contarPendientes: async () => pendientes,
    prsActivos: async () => activos,
    commitsPendientes: async () => [{ id: 'aaaa1111', mensaje: 'feat: x', autor: 'Ana', fecha: '2026-10-01' }],
    urlDePr: (r, id) => `https://ado/${r}/pullrequest/${id}`,
  };
}

test('crea con las ramas reales del repo y el titulo del par', async () => {
  let recibido = null;
  const r = await crearPrDePromocion(ado(), { repo: 'Api.Net', par: 'stage-main', quien: 'Jona' },
    { crearPr: async (d) => { recibido = d; return { id: 1, link: 'L' }; } });
  assert.equal(recibido.origen, 'master');
  assert.equal(recibido.destino, 'main');
  assert.equal(recibido.titulo, 'StageToMain');
  assert.match(recibido.descripcion, /aaaa1111 feat: x \(Ana\)/);
  assert.deepEqual(r, { id: 1, link: 'L', titulo: 'StageToMain' });
});

test('con un PR activo no crea: 409 con el link del existente', async () => {
  let creo = false;
  await assert.rejects(
    () => crearPrDePromocion(ado({ activos: [{ id: 9, titulo: 'StageToMain' }] }), { repo: 'R', par: 'stage-main' }, { crearPr: async () => { creo = true; } }),
    (e) => e.status === 409 && e.link === 'https://ado/R/pullrequest/9',
  );
  assert.equal(creo, false);
});

test('sin cambios al momento de crear no crea: 409', async () => {
  await assert.rejects(
    () => crearPrDePromocion(ado({ pendientes: 0 }), { repo: 'R', par: 'dev-stage' }, { crearPr: async () => { throw new Error('no'); } }),
    (e) => e.status === 409 && /Ya no hay cambios/.test(e.message),
  );
});

test('un repo sin las tres puntas: 400', async () => {
  await assert.rejects(
    () => crearPrDePromocion(ado({ ramas: ['master'] }), { repo: 'R', par: 'dev-stage' }, { crearPr: async () => {} }),
    (e) => e.status === 400,
  );
});
