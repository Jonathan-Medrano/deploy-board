import { esParValido, ramasDelRepo, ramasDelPar } from './ramas.js';

// Corre `fn` sobre cada item con a lo sumo `n` en vuelo. 46 repos de una vez son 46 pedidos
// simultaneos al mismo PAT: Azure empieza a contestar 429 y la medicion sale a medias.
async function enLotes(items, n, fn) {
  const out = new Array(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const k = siguiente++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return out;
}

export async function medirUnRepo(ado, { repo, ramas, par }) {
  const { origen, destino } = ramasDelPar(ramas, par);
  const base = { repo, ramas: { origen, destino }, pendientes: 0, ultimo: null, commits: [], prActivo: null, error: null };
  try {
    const [pendientes, activos] = await Promise.all([
      ado.contarPendientes(repo, origen, destino),
      ado.prsActivos(repo, origen, destino),
    ]);
    const commits = pendientes > 0 ? await ado.commitsPendientes(repo, origen, destino, 50) : [];
    const masNuevo = [...activos].sort((a, b) => b.id - a.id)[0] || null;
    return {
      ...base, pendientes, commits, ultimo: commits[0] || null,
      prActivo: masNuevo ? { ...masNuevo, link: ado.urlDePr(repo, masNuevo.id) } : null,
    };
  } catch (e) {
    // Un repo caido es UNA fila con su error, no una medicion caida.
    return { ...base, error: e.message };
  }
}

function rango(f) {
  if (f.pendientes > 0) return 0;
  if (f.error) return 1;
  return 2;
}

export async function medirRepos(ado, par, { concurrencia = 4 } = {}) {
  if (!esParValido(par)) throw new Error(`Par desconocido: ${par}. Usá dev-stage, stage-main o stage-dev.`);
  const repos = (await ado.listarRepos()).filter((r) => !r.deshabilitado);

  const conRamas = await enLotes(repos, concurrencia, async (r) => {
    try {
      return { repo: r.nombre, ramas: ramasDelRepo(await ado.listarRamas(r.nombre)), error: null };
    } catch (e) {
      return { repo: r.nombre, ramas: null, error: e.message };
    }
  });

  // Sin las tres puntas el repo no tiene circuito de promocion: no se lista. Uno que no se pudo
  // leer SI se lista, con su error: callarlo se leeria como "no aplica".
  const aplican = conRamas.filter((r) => r.error || r.ramas);
  const filas = await enLotes(aplican, concurrencia, (r) => (r.error
    ? { repo: r.repo, ramas: null, pendientes: 0, ultimo: null, commits: [], prActivo: null, error: r.error }
    : medirUnRepo(ado, { repo: r.repo, ramas: r.ramas, par })));

  return filas.sort((a, b) => rango(a) - rango(b) || b.pendientes - a.pendientes || a.repo.localeCompare(b.repo));
}
