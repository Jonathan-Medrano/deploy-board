import { ramasDelRepo, tituloDelPar } from './ramas.js';
import { medirUnRepo } from './medir.js';
import { descripcionDelPr } from '../ado/prs.js';

function error(status, mensaje, extra = {}) {
  return Object.assign(new Error(mensaje), { status }, extra);
}

// Se re-mide ESE repo en el momento de crear: la tabla de la pantalla puede tener minutos, y
// en ese rato otro dev pudo crear el PR o mergear el pase. Crear sobre una foto vieja duplica
// un PR o abre uno vacio.
export async function crearPrDePromocion(ado, { repo, par, quien = null }, deps) {
  const titulo = tituloDelPar(par);
  const ramas = ramasDelRepo(await ado.listarRamas(repo));
  if (!ramas) throw error(400, `${repo} no tiene las ramas dev, stage y main: no tiene pases de rama.`);
  const fila = await medirUnRepo(ado, { repo, ramas, par });
  if (fila.error) throw error(502, fila.error);
  if (fila.prActivo) throw error(409, `Ya hay un PR activo de ${fila.ramas.origen} a ${fila.ramas.destino} en ${repo}: #${fila.prActivo.id}.`, { link: fila.prActivo.link });
  if (!fila.pendientes) throw error(409, `Ya no hay cambios para ${titulo} en ${repo}.`);
  const descripcion = descripcionDelPr({ quien, commits: fila.commits, pendientes: fila.pendientes });
  const creado = await deps.crearPr({ repo, origen: fila.ramas.origen, destino: fila.ramas.destino, titulo, descripcion });
  return { ...creado, titulo };
}
