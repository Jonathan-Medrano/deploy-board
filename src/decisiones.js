import crypto from 'node:crypto';
import { agruparPorResponsable } from './reporte.js';

// Lo que una persona DECIDE, separado de lo que se MIDE. Tres cosas, todas por sprint:
//   marcas    -> "ya lo subi a main" (main no se sondea nunca)
//   ignorados -> "este script no va en esta subida"
//   aceptados -> "este desvio es asi a proposito"
// Las dos primeras se atan al hash del script y la tercera a la firma del desvio: si lo que se
// decidio cambia, la decision vence sola en vez de tapar algo que nadie miro.

const LISTAS = { marca: 'marcas', ignorado: 'ignorados', aceptado: 'aceptados' };

// La firma es el HECHO, no sus derivados: responsable y severidad pueden cambiar por config
// sin que el desvio sea otro, y cambiarlas no deberia vencer una aceptacion.
export function firmaDe(d) {
  const partes = [d.codigo, d.scriptId, d.wiId, d.taskId, d.titulo, d.detalle].map((x) => (x == null ? '' : String(x)));
  return crypto.createHash('sha1').update(partes.join('|'), 'utf8').digest('hex');
}

export function claveDeSprint(meta = {}) {
  return meta?.sprint || meta?.iteracion || 'sin-sprint';
}

function sprintVacio() {
  return { marcas: {}, ignorados: {}, aceptados: {} };
}

function normalizarSprint(crudo) {
  const o = crudo && typeof crudo === 'object' ? crudo : {};
  const out = sprintVacio();
  for (const l of Object.values(LISTAS)) if (o[l] && typeof o[l] === 'object') out[l] = { ...o[l] };
  return out;
}

export function normalizarDecisiones(crudo) {
  const o = crudo && typeof crudo === 'object' ? crudo : {};
  const sprints = {};
  for (const [k, v] of Object.entries(o.sprints && typeof o.sprints === 'object' ? o.sprints : {})) sprints[k] = normalizarSprint(v);
  return { version: Number.isInteger(o.version) ? o.version : 0, sprints };
}

export function aplicarCambioDecision(estado, { sprint, tipo, clave, poner, hash = null, codigo = null, motivo = '', quien = null, fecha = null }) {
  const lista = LISTAS[tipo];
  if (!lista) throw new Error(`tipo "${tipo}" no existe: esperaba "marca", "ignorado" o "aceptado".`);
  if (!sprint || typeof sprint !== 'string') throw new Error('Falta el sprint: una decision sin sprint se aplicaria a todos.');
  if (!clave || typeof clave !== 'string') throw new Error('Clave vacia: una clave vacia pisa la entrada siguiente.');
  const texto = String(motivo || '').trim();
  if (poner && tipo !== 'marca' && !texto) throw new Error('El motivo es obligatorio para ignorar o aceptar.');

  const base = normalizarDecisiones(estado);
  const delSprint = normalizarSprint(base.sprints[sprint]);
  const copia = { ...delSprint[lista] };
  if (poner) {
    if (tipo === 'marca') copia[clave] = { hash, por: quien, fecha };
    else if (tipo === 'ignorado') copia[clave] = { hash, por: quien, fecha, motivo: texto };
    else copia[clave] = { codigo, por: quien, fecha, motivo: texto };
  } else {
    delete copia[clave];
  }
  return { ...base, sprints: { ...base.sprints, [sprint]: { ...delSprint, [lista]: copia } } };
}

// Un script ilegible tiene hash null. Una decision tomada sobre el null sigue valiendo mientras
// siga ilegible: no hay contenido con el que comparar, y vencerla haria imposible marcarlo.
function vigente(decision, fila) {
  return !!decision && (decision.hash ?? null) === (fila.hash ?? null);
}

// Pura: toma la medicion guardada y le aplica lo decidido. Todo lo que la pantalla cuenta sobre
// desvios sale de aca — si la pantalla recalculara, la consola y el tablero dirian cosas
// distintas sobre la misma medicion.
export function aplicarDecisiones(vista, decisionesDelSprint) {
  if (!vista) return vista;
  const dec = normalizarSprint(decisionesDelSprint);

  const filas = (vista.filas || []).map((f) => {
    const m = dec.marcas[f.id], i = dec.ignorados[f.id];
    return {
      ...f,
      marca: vigente(m, f) ? m : null,
      marcaVencida: !!m && !vigente(m, f),
      ignorado: vigente(i, f) ? i : null,
      ignoradoVencido: !!i && !vigente(i, f),
    };
  });
  const apartados = new Set(filas.filter((f) => f.marca || f.ignorado).map((f) => f.id));

  const desvios = (vista.desvios || []).map((d) => {
    const firma = d.firma || firmaDe(d);
    const a = dec.aceptados[firma] || null;
    return { ...d, firma, estado: a ? 'aceptado' : 'abierto', aceptado: a };
  });
  const efectivos = desvios.filter((d) => d.estado === 'abierto' && !(d.scriptId && apartados.has(d.scriptId)));
  const abiertas = new Set(efectivos.map((d) => d.firma));
  const bloqueantes = efectivos.filter((d) => d.severidad === 'bloqueante').length;

  return {
    ...vista,
    meta: { ...vista.meta, bloqueantes, listo: bloqueantes === 0 },
    filas,
    desvios,
    personas: agruparPorResponsable(efectivos),
    // Un bloque sin firmas es de una medicion vieja: se deja como vino antes que esconderlo.
    revisar: (vista.revisar || []).filter((g) => !(g.firmas || []).length || g.firmas.some((f) => abiertas.has(f))),
  };
}

// "Resuelto" no es un boton: es el desvio que estaba y en la medicion siguiente ya no esta.
// Solo contra la medicion anterior del MISMO sprint; contra otro seria comparar peras con manzanas.
export function desviosResueltos(anterior, actual) {
  if (!anterior || !actual) return [];
  if (claveDeSprint(anterior.meta) !== claveDeSprint(actual.meta)) return [];
  const ahora = new Set((actual.desvios || []).map((d) => d.firma || firmaDe(d)));
  return (anterior.desvios || [])
    .map((d) => ({ ...d, firma: d.firma || firmaDe(d) }))
    .filter((d) => !ahora.has(d.firma))
    .map(({ codigo, severidad, titulo, detalle, scriptId = null, wiId = null, firma }) => ({ codigo, severidad, titulo, detalle, scriptId, wiId, firma }));
}
