import fs from 'node:fs';
import path from 'node:path';
import { normalizarDecisiones } from './decisiones.js';

// Donde viven las marcas y la ultima medicion. Es una CARPETA configurable a proposito: el
// sistema corre en la maquina de cada uno, pero las marcas de main no son personales — que
// Ana marque y vos lo veas es todo el punto. Apuntando DEPLOY_BOARD_ESTADO a una carpeta
// compartida, el equipo comparte marcas sin montar un servidor.
export function rutasDeEstado(env = process.env, raiz = process.cwd()) {
  const dir = env.DEPLOY_BOARD_ESTADO || path.join(raiz, 'estado');
  return {
    dir,
    decisiones: path.join(dir, 'decisiones.json'),
    // El de antes de las decisiones por sprint. No se migra: sus ids y su falta de hash harian
    // que aplicarlo fuera inventar. Solo se lee si existe, para avisar.
    marcasViejas: path.join(dir, 'marcas.json'),
    vista: path.join(dir, 'vista.json'),
  };
}

// Un archivo de decisiones que existe y no parsea NO es un archivo vacio. Leerlo como vacio
// hacia que el siguiente guardado escribiera encima solo la marca nueva: se borraban las de
// todo el equipo sin que nadie lo viera.
export class ArchivoDanado extends Error {
  constructor(ruta) {
    super(`El archivo ${path.basename(ruta)} esta danado: no se guardo nada. Revisalo a mano antes de seguir marcando.`);
    this.ruta = ruta;
  }
}

// Otro guardo entre tu lectura y tu escritura. Trae lo que hay ahora para que la pantalla
// reaplique su cambio encima, en vez de pisar el de la otra persona.
export class VersionVieja extends Error {
  constructor(actual) {
    super('Alguien guardo decisiones mientras tanto.');
    this.actual = actual;
  }
}

function leerJson(ruta, deps) {
  const existe = deps.existe || fs.existsSync;
  const leer = deps.leer || ((r) => fs.readFileSync(r, 'utf8'));
  if (!existe(ruta)) return null;
  try {
    return JSON.parse(leer(ruta));
  } catch {
    throw new ArchivoDanado(ruta);
  }
}

// Temporal + rename: el rename reemplaza el archivo de una sola vez, asi un corte a mitad de
// camino deja el anterior entero en vez de un JSON truncado. El pid va en el nombre para que
// dos procesos sobre la misma carpeta compartida no escriban el mismo temporal.
function escribirJson(ruta, valor, deps) {
  const mkdir = deps.mkdir || ((d) => fs.mkdirSync(d, { recursive: true }));
  const escribir = deps.escribir || ((r, t) => fs.writeFileSync(r, t));
  const renombrar = deps.renombrar || fs.renameSync;
  const borrar = deps.borrar || ((r) => fs.rmSync(r, { force: true }));
  mkdir(path.dirname(ruta));
  const tmp = `${ruta}.tmp-${process.pid}`;
  try {
    escribir(tmp, JSON.stringify(valor, null, 2));
    renombrar(tmp, ruta);
  } catch (e) {
    borrar(tmp);
    throw e;
  }
}

// El nombre del archivo sale del sprint, que viene de ADO y de nombres de carpeta: una barra
// o dos puntos en un nombre de archivo de Windows lo parte o lo rompe.
function claveDeVista(sprint, iteracion) {
  const base = sprint || iteracion || 'sin-sprint';
  return String(base).replace(/[^\w.-]+/g, '_');
}

export function crearAlmacen(env = process.env, raiz = process.cwd(), deps = {}) {
  const r = rutasDeEstado(env, raiz);
  const listar = deps.listar || ((d) => (fs.existsSync(d) ? fs.readdirSync(d) : []));
  const rutaDeVista = (sprint, iteracion) => path.join(r.dir, `vista-${claveDeVista(sprint, iteracion)}.json`);

  // Una vista ilegible SI se lee como ausente: es una foto que se regenera midiendo, no una
  // decision de nadie. Frenar el tablero por eso no protege nada.
  const leerVistaSegura = (ruta) => {
    try { return leerJson(ruta, deps); } catch (e) { if (e instanceof ArchivoDanado) return null; throw e; }
  };

  return {
    rutas: r,
    leerDecisiones: () => normalizarDecisiones(leerJson(r.decisiones, deps)),
    hayMarcasViejas: () => (deps.existe || fs.existsSync)(r.marcasViejas),

    // Sin lock de archivo: en una carpeta de red no son confiables. Queda una ventana entre
    // releer la version y el rename; dos guardados en el mismo milisegundo pueden pasar los
    // dos. Se acepta: el caso real es "marque hace un rato con la pantalla vieja".
    guardarDecisiones: (valor, versionLeida) => {
      const actual = normalizarDecisiones(leerJson(r.decisiones, deps));
      if (actual.version !== versionLeida) throw new VersionVieja(actual);
      const nuevo = { ...normalizarDecisiones(valor), version: actual.version + 1 };
      escribirJson(r.decisiones, nuevo, deps);
      return nuevo;
    },

    leerVista: (sprint = null, iteracion = null) => {
      if (sprint || iteracion) return leerVistaSegura(rutaDeVista(sprint, iteracion));
      let ultima = null;
      for (const f of listar(r.dir)) {
        if (!/^vista-.+\.json$/.test(f)) continue;
        const v = leerVistaSegura(path.join(r.dir, f));
        if (v && (!ultima || String(v.meta?.medido || '') > String(ultima.meta?.medido || ''))) ultima = v;
      }
      return ultima || leerVistaSegura(r.vista);
    },

    guardarVista: (v) => escribirJson(rutaDeVista(v?.meta?.sprint, v?.meta?.iteracion), v, deps),
  };
}
