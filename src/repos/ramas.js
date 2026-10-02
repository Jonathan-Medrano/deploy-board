// Los tres pases de rama que el equipo hace a mano repo por repo. El titulo es el nombre logico
// que ya usan los PR del equipo (StageToMain, DevToStage, StageToDev), aunque en Api.Net la rama
// de stage se llame master: asi el mismo pase se lee igual en todos los repos.
export const PARES = {
  'dev-stage': { origen: 'dev', destino: 'stage', titulo: 'DevToStage' },
  'stage-main': { origen: 'stage', destino: 'main', titulo: 'StageToMain' },
  'stage-dev': { origen: 'stage', destino: 'dev', titulo: 'StageToDev' },
};

export function esParValido(par) {
  return Object.prototype.hasOwnProperty.call(PARES, par);
}

function parODeError(par) {
  if (!esParValido(par)) throw new Error(`Par desconocido: ${par}. Usá dev-stage, stage-main o stage-dev.`);
  return PARES[par];
}

// Medido el 2026-10-02 sobre los 46 repos del proyecto: dev es `dev` o `develop` (FidelFrontWeb,
// FidelFront, PedidosWeb), stage es `stage` o `master` (Api.Net, Fidel), main es `main`.
// EcommerceErrors.Fidel.Api tiene stage Y master: gana stage. Sin las tres no hay circuito de
// promocion y el repo no se lista.
export function ramasDelRepo(nombres) {
  const hay = new Set(nombres || []);
  const dev = hay.has('dev') ? 'dev' : (hay.has('develop') ? 'develop' : null);
  const stage = hay.has('stage') ? 'stage' : (hay.has('master') ? 'master' : null);
  const main = hay.has('main') ? 'main' : null;
  return dev && stage && main ? { dev, stage, main } : null;
}

export function ramasDelPar(ramas, par) {
  const p = parODeError(par);
  return { origen: ramas[p.origen], destino: ramas[p.destino] };
}

export function tituloDelPar(par) {
  return parODeError(par).titulo;
}
