// Mensajes de avance para la ventana donde corre el sistema. Medir tarda (Azure + dos bases) y
// una consola quieta se lee como colgada. Van a stderr: stdout queda limpio para --json.

const COLOR = { paso: 36, ok: 32, aviso: 33, error: 31, tenue: 90 };
const ICONO = { inicio: '⏳', paso: '  ›', ok: '✔', aviso: '⚠', error: '✖' };

// Sin terminal (salida redirigida a un archivo) los codigos de color ensucian el texto; y
// NO_COLOR es la convencion para apagarlos a mano.
export function usaColor(stream = process.stderr, env = process.env) {
  return !env.NO_COLOR && !!stream.isTTY;
}

function hora(d) {
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export function segundos(ms) {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export function crearProgreso({
  escribir = (t) => process.stderr.write(t),
  color = usaColor(),
  ahora = () => new Date(),
} = {}) {
  const pintar = (c, t) => (color ? `\x1b[${c}m${t}\x1b[0m` : t);
  const linea = (tipo, c, texto) => {
    escribir(`${pintar(COLOR.tenue, hora(ahora()))} ${pintar(c, `${ICONO[tipo]} ${texto}`)}\n`);
  };
  return {
    inicio: (t) => linea('inicio', COLOR.paso, t),
    paso: (t) => linea('paso', COLOR.tenue, t),
    ok: (t) => linea('ok', COLOR.ok, t),
    aviso: (t) => linea('aviso', COLOR.aviso, t),
    error: (t) => linea('error', COLOR.error, t),
  };
}

// Envuelve una medicion con "midiendo..." al empezar y el resultado al terminar. Termina en
// verde si esta lista para subir, en amarillo si hay bloqueantes, en rojo si fallo; el
// error se vuelve a lanzar: avisar no es manejarlo.
export async function conProgreso(progreso, que, medir, { reloj = () => Date.now() } = {}) {
  const t0 = reloj();
  progreso.inicio(`Midiendo ${que}...`);
  try {
    const r = await medir(progreso.paso);
    const dur = segundos(reloj() - t0);
    const bloq = r?.bloqueantes ?? 0;
    if (bloq > 0) progreso.aviso(`Termino de medir ${que} en ${dur}: ${bloq} bloqueante${bloq === 1 ? '' : 's'}.`);
    else progreso.ok(`Termino de medir ${que} en ${dur}: listo para subir.`);
    for (const a of r?.avisos || []) progreso.aviso(a);
    return r;
  } catch (e) {
    progreso.error(`Fallo la medicion de ${que} despues de ${segundos(reloj() - t0)}: ${e.message}`);
    throw e;
  }
}
