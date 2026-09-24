import { esRespaldoViejo } from './fuentes/comun.js';
import { leerScriptDelRepo, REPO_POR_DEFECTO, RAMA_POR_DEFECTO, CARPETA_POR_DEFECTO } from './fuentes/repoAdo.js';
import { medirAmbiente } from './db/ejecutar.js';

// En Api.Net la rama de stage es master: los PR "stage to main" salen de master, los hotfix de
// stage entran a master, y el stageToDev es el PR master -> dev. No hay rama llamada "stage".
export const RAMA_STAGE_POR_DEFECTO = 'master';

// El pase stage -> dev NO depende del sprint: se hace despues de cada subida de stage a main,
// y el dev -> stage -> main del sprint N se sube en la primera semana del N+1. Por eso no se
// mira la carpeta de un sprint sino la diferencia entre las ramas: lo que stage tiene y dev no,
// sea del sprint que sea. Un script EDITADO en stage tambien cuenta: el que corrio en dev es
// otra version.
export function candidatosStageToDev(cambios, carpeta = CARPETA_POR_DEFECTO) {
  const prefijo = `${carpeta}/`;
  return (cambios || [])
    .filter((c) => c && c.item && !c.item.isFolder)
    .filter((c) => !/delete/i.test(String(c.changeType || '')))
    .map((c) => c.item.path)
    .filter((ruta) => ruta.startsWith(prefijo) && /\.sql$/i.test(ruta) && !esRespaldoViejo(ruta));
}

export async function descubrirStageToDev(ado, {
  repo = REPO_POR_DEFECTO, ramaStage = RAMA_STAGE_POR_DEFECTO, ramaDev = RAMA_POR_DEFECTO, carpeta = CARPETA_POR_DEFECTO,
} = {}) {
  const rutas = candidatosStageToDev(await ado.diffEntreRamas(repo, ramaDev, ramaStage), carpeta);
  const out = [];
  for (const ruta of rutas) {
    const partes = ruta.slice(carpeta.length + 1).split('/');
    // La carpeta del work item es la que esta dentro del sprint: Sprint_X/US-123_algo/archivo.
    const carpetaWi = partes.length >= 3 ? partes[1] : partes[0];
    out.push(await leerScriptDelRepo(ado, { repo, rama: ramaStage, ruta, carpetaWi }));
  }
  return out;
}

export async function medirStageToDev(ado, opciones = {}, deps = {}) {
  const o = {
    repo: REPO_POR_DEFECTO, ramaStage: RAMA_STAGE_POR_DEFECTO, ramaDev: RAMA_POR_DEFECTO, carpeta: CARPETA_POR_DEFECTO,
    ...Object.fromEntries(Object.entries(opciones).filter(([, v]) => v != null && v !== '')),
  };
  const scripts = await descubrirStageToDev(ado, o);
  const medir = deps.medirAmbiente || medirAmbiente;
  const estados = {};
  for (const amb of ['dev', 'stage']) {
    const medido = scripts.length ? await medir(scripts, amb, { env: deps.env }) : {};
    for (const [id, v] of Object.entries(medido)) (estados[id] ||= {})[amb] = v;
  }
  return { ramaStage: o.ramaStage, ramaDev: o.ramaDev, scripts, estados };
}
