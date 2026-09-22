import { crearClienteAdo } from './ado/client.js';
import { rutaDeIteracion, carpetaSugerida, ordenarIteraciones } from './sprints.js';
import { opcionesDelRepo } from './medir.js';
import { CARPETA_POR_DEFECTO } from './fuentes/repoAdo.js';

// Las dos listas que necesita el selector, y la sugerencia que las empareja. Se devuelven
// JUNTAS a proposito: una iteracion sin su carpeta, o al reves, deja la comparacion contra el
// repo en silencio, y eso se lee como "todo coincide" cuando no se comparo nada.
// El sprint en curso: el que contiene la fecha de hoy. Es lo que se quiere ver al abrir el
// tablero — ordenar por fecha deja arriba los sprints FUTUROS, que estan creados en Azure con
// meses de anticipacion y no tienen nada que subir.
export function iteracionActual(iteraciones, hoy = new Date().toISOString().slice(0, 10)) {
  return iteraciones.find((i) => i.inicio && i.fin && i.inicio.slice(0, 10) <= hoy && hoy <= i.fin.slice(0, 10)) || null;
}

export async function sprintsDisponibles(env = process.env, deps = {}) {
  const ado = deps.ado || crearClienteAdo(env);
  const { repo, rama } = opcionesDelRepo(env);

  const iteraciones = ordenarIteraciones(
    (await ado.listarIteraciones()).map((i) => {
      const ruta = rutaDeIteracion(i.ruta);
      return { nombre: i.nombre, ruta, inicio: i.inicio, fin: i.fin, carpeta: carpetaSugerida(ruta) };
    })
  );

  // Las carpetas que EXISTEN en el repo. Sin esto el selector ofrece nombres derivados que
  // pueden no estar creados todavia, y el que elige no tiene como saberlo hasta que mide.
  let carpetas = [];
  let nota = null;
  try {
    const items = await ado.listarArchivos(repo, CARPETA_POR_DEFECTO, rama);
    const prefijo = CARPETA_POR_DEFECTO + '/';
    carpetas = [...new Set(
      items
        .filter((i) => i.ruta.startsWith(prefijo))
        .map((i) => i.ruta.slice(prefijo.length).split('/'))
        // Con mas de un segmento hay carpeta; con uno solo es un archivo suelto en la raiz,
        // y el README de convenciones que vive ahi aparecia en la lista como si fuera un sprint.
        .filter((partes) => partes.length > 1 && partes[0])
        .map((partes) => partes[0])
    )].sort().reverse();
  } catch (e) {
    nota = `No pude leer las carpetas de ${repo} (${e.message}). Podes elegir la iteracion igual, pero no voy a poder comparar contra el repo.`;
  }

  const actual = iteracionActual(iteraciones, deps.hoy);
  return { iteraciones, carpetas, repo, rama, nota, actual };
}
