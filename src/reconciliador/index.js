// El adjunto gana para el CONTENIDO porque es literalmente el archivo que se sube al
// FileZilla. El repo aporta existencia y carpeta. El desacuerdo entre las dos no se
// resuelve eligiendo una: se conserva en `fuentes` y lo reporta D5 o D6.
export function reconciliar({ adjuntos = [], repo = [] }) {
  const mapa = new Map();

  const sumar = (entrada) => {
    const { fuente, responsables: resp, ...resto } = entrada;
    const previo = mapa.get(entrada.id);

    if (!previo) {
      mapa.set(entrada.id, {
        ...resto,
        fuentes: [fuente],
        // Las dos numeraciones se conservan POR SEPARADO: D10 no puede comparar lo que el
        // reconciliador ya aplasto en un solo valor.
        ordenPorFuente: { adjunto: null, repo: null, [fuente]: entrada.orden ?? null },
        responsables: { ...(resp || {}) },
      });
      return;
    }

    if (!previo.fuentes.includes(fuente)) previo.fuentes.push(fuente);
    previo.ordenPorFuente[fuente] = entrada.orden ?? null;
    // Cada fuente aporta SU responsable: el que commiteo y el que subio el adjunto son
    // personas distintas, y cada desvio necesita una u otra.
    Object.assign(previo.responsables, resp || {});

    if (fuente === 'adjunto') {
      mapa.set(entrada.id, {
        ...previo, ...resto,
        fuentes: previo.fuentes,
        ordenPorFuente: previo.ordenPorFuente,
        responsables: previo.responsables,
      });
    } else if (entrada.carpeta && !previo.carpeta) {
      previo.carpeta = entrada.carpeta;
    }
  };

  for (const s of repo) sumar(s);
  for (const s of adjuntos) sumar(s);

  return ordenarParaEjecucion([...mapa.values()]);
}

// El orden de la lista ES el orden de ejecucion: los PRE van antes del deploy, despues por
// work item y por el NN del nombre. Vive aca y se exporta para que la capa de presentacion
// no reimplemente el criterio: dos ordenes que se creen iguales y no lo sean es como se
// sube un script antes que su dependencia.
export function ordenarParaEjecucion(scripts) {
  return [...scripts].sort((a, b) =>
    (b.esPre ? 1 : 0) - (a.esPre ? 1 : 0) ||
    (a.wiId ?? Infinity) - (b.wiId ?? Infinity) ||
    (a.orden ?? Infinity) - (b.orden ?? Infinity) ||
    String(a.archivo).localeCompare(String(b.archivo))
  );
}
