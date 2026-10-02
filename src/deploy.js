// Que un script este en la rama main NO dice que corrio en produccion: el stage -> main se
// mergea antes del deploy, y en ese hueco los scripts figuraban como subidos sin haberse
// ejecutado. La señal de "deploy hecho" es la tarjeta "Scripts" del sprint: el equipo la cierra
// cuando termina de ejecutar (medido en 11 sprints, mayo a agosto 2026, una User Story por
// sprint titulada "Scripts" o "SCRIPTS").
const CERRADA = new Set(['closed', 'done']);

export function esTarjetaDeScripts(wi) {
  return !wi.fueraDelSprint && String(wi.titulo || '').trim().toLowerCase() === 'scripts';
}

export function estadoDelDeploy(wis = []) {
  const tarjetas = wis.filter(esTarjetaDeScripts).map((w) => ({ id: w.id, estado: w.estado || '' }));
  if (!tarjetas.length) {
    // Sin tarjeta no hay forma de saberlo, y dar por ejecutado lo que esta en main es justo el
    // falso verde que esto corrige: se trata como pendiente y la pantalla lo explica.
    return { hecho: false, tarjetas, nota: 'No encontre la tarjeta "Scripts" del sprint: lo que esta en main se toma como todavia no ejecutado en produccion.' };
  }
  const hecho = tarjetas.every((t) => CERRADA.has(t.estado.toLowerCase()));
  return { hecho, tarjetas, nota: null };
}
