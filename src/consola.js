import { construirVista } from './vista.js';
import { aplicarDecisiones } from './decisiones.js';

// La consola y el tablero tienen que decir lo MISMO sobre la misma medicion. Antes la consola
// imprimia la medicion cruda: con un desvio aceptado en el tablero, uno decia "listo" y la
// otra "1 bloqueante". Se pasa por la misma aplicarDecisiones y se devuelve con forma de
// reporte, para que formatearReporte no cambie de contrato.
export function reporteConDecisiones(reporte, decisionesDelSprint, sprint = null, { danadas = false } = {}) {
  const v = aplicarDecisiones(construirVista(reporte, { sprint }), decisionesDelSprint);
  const aceptados = v.desvios.filter((d) => d.estado === 'aceptado');
  return {
    ...reporte,
    bloqueantes: v.meta.bloqueantes,
    listoParaSubir: v.meta.listo,
    // Solo lo abierto pinta el semaforo: un aceptado en rojo contradice al encabezado.
    desvios: v.desvios.filter((d) => d.estado === 'abierto'),
    pendientesPorResponsable: v.personas,
    revisarAMano: v.revisar,
    decisiones: {
      sprint,
      danadas,
      aceptados: aceptados.map((d) => ({ codigo: d.codigo, titulo: d.titulo, ...d.aceptado })),
      marcados: v.filas.filter((f) => f.marca).map((f) => ({ archivo: f.arch, ...f.marca })),
      ignorados: v.filas.filter((f) => f.ignorado).map((f) => ({ archivo: f.arch, ...f.ignorado })),
      vencidos: v.filas.filter((f) => f.marcaVencida || f.ignoradoVencido).map((f) => f.arch),
    },
  };
}
