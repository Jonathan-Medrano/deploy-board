import { defineModulo } from '../fuentes/comun.js';

// El adjunto gana para el CONTENIDO porque es literalmente el archivo que se sube al
// FileZilla. El repo aporta existencia y carpeta. El desacuerdo entre las dos no se
// resuelve eligiendo una: se conserva en `fuentes` y lo reporta D5 o D6.
export function reconciliar({ adjuntos = [], repo = [] }) {
  const mapa = new Map();

  const version = (e) => ({ fuente: e.fuente, donde: e.contenedorId ?? e.carpeta ?? null, hash: e.hash ?? null, creado: e.creado ?? null, orden: e.orden ?? null });

  const sumar = (entrada) => {
    const { fuente, responsables: resp, aliasDe, ...resto } = entrada;
    const id = entrada.id;
    const previo = mapa.get(id);

    if (!previo) {
      mapa.set(id, {
        ...resto,
        id,
        ...(aliasDe && aliasDe.length ? { aliases: [...aliasDe].sort() } : {}),
        fuentes: [fuente],
        // Las dos numeraciones se conservan POR SEPARADO: D10 no puede comparar lo que el
        // reconciliador ya aplasto en un solo valor.
        ordenPorFuente: { adjunto: null, repo: null, [fuente]: entrada.orden ?? null },
        responsables: { ...(resp || {}) },
        versiones: [version(entrada)],
        contenidoDistinto: false,
      });
      return;
    }

    const yaHabiaAdjunto = previo.fuentes.includes('adjunto');
    if (!previo.fuentes.includes(fuente)) previo.fuentes.push(fuente);
    // El orden de la tarjeta sigue al adjunto MEDIDO (se asigna abajo): con el ultimo en llegar
    // dependia del orden en que Azure lista los work items.
    if (fuente !== 'adjunto') previo.ordenPorFuente[fuente] = entrada.orden ?? null;
    if (aliasDe && aliasDe.length) {
      previo.aliases = [...new Set([...(previo.aliases || []), ...aliasDe])].filter((x) => x !== id).sort();
    }
    // Cada fuente aporta SU responsable: el que commiteo y el que subio el adjunto son
    // personas distintas, y cada desvio necesita una u otra.
    Object.assign(previo.responsables, resp || {});
    previo.versiones.push(version(entrada));
    // D12: el mismo script con contenido distinto NO se resuelve eligiendo en silencio. Se
    // marca, y D12 lo reporta con todas las versiones. Un ilegible (hash null) no cuenta:
    // no se sabe que dice.
    const hashes = new Set(previo.versiones.map((v) => v.hash).filter(Boolean));
    previo.contenidoDistinto = hashes.size > 1;

    // El contenido que se MIDE es el del adjunto, porque es lo que se sube al FileZilla. Entre
    // dos adjuntos, el mas reciente: WIQL los trae por id de work item, no por fecha, y el
    // ultimo en llegar podia ser la version vieja que quedo colgada en otra tarjeta.
    // El ganador no puede depender del orden de llegada: con la fecha empatada o faltante, el
    // ultimo en llegar ganaba y la misma tarjeta media un contenido u otro segun la corrida.
    // Orden total: fecha, despues lugar, despues hash. Un empate exacto es el mismo contenido.
    const tupla = (x) => [String(x.creado || ''), String(x.contenedorId ?? x.carpeta ?? ''), String(x.hash || '')];
    const gana = (a, b) => {
      const ta = tupla(a);
      const tb = tupla(b);
      for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return ta[i] > tb[i];
      return false;
    };
    const adjuntoMasNuevo = fuente === 'adjunto' && (!yaHabiaAdjunto || gana(entrada, previo));
    if (adjuntoMasNuevo) {
      previo.ordenPorFuente.adjunto = entrada.orden ?? null;
      mapa.set(id, {
        ...previo, ...resto, id,
        ...(previo.aliases ? { aliases: previo.aliases } : {}),
        fuentes: previo.fuentes,
        ordenPorFuente: previo.ordenPorFuente,
        responsables: previo.responsables,
        versiones: previo.versiones,
        contenidoDistinto: previo.contenidoDistinto,
      });
    } else if (entrada.carpeta && !previo.carpeta) {
      previo.carpeta = entrada.carpeta;
    }
  };

  const delRepoPrevio = desambiguar(repo);
  for (const s of delRepoPrevio) sumar(s);
  for (const s of unirUsYTaskDeScripts(desambiguar(adjuntos), new Set(delRepoPrevio.map((x) => x.id)))) sumar(s);

  // Un script sin id en el nombre se vincula por contenedor de los dos lados, pero cada lado
  // tiene su contenedor: la Task de Scripts en la tarjeta, la carpeta de la US en el repo. Los
  // ids no coinciden y el mismo script salia D5 y D6 a la vez. Se emparejan por nombre SOLO si
  // hay un unico candidato del otro lado: con dos o mas, elegir seria adivinar.
  const sufijo = (id) => String(id).slice(String(id).indexOf('/') + 1);
  const solo = (s, fuente) => s.fuentes.length === 1 && s.fuentes[0] === fuente && s.vinculadoPor === 'contenedor';
  const adjuntosContenedor = [...mapa.values()].filter((s) => solo(s, 'adjunto'));

  // Contar adjuntos por sufijo para detectar ambiguedad: dos adjuntos del mismo nombre no se
  // emparejan, porque elegir cual quedarse seria adivinar.
  const adjuntosPorSufijo = new Map();
  for (const a of adjuntosContenedor) {
    const suf = sufijo(a.id);
    if (!adjuntosPorSufijo.has(suf)) adjuntosPorSufijo.set(suf, []);
    adjuntosPorSufijo.get(suf).push(a);
  }

  const delRepo = [...mapa.values()].filter((s) => solo(s, 'repo'));
  for (const a of adjuntosContenedor) {
    const suf = sufijo(a.id);
    if (adjuntosPorSufijo.get(suf).length !== 1) continue;

    const pares = delRepo.filter((r) => sufijo(r.id) === suf);
    if (pares.length !== 1) continue;
    const r = pares[0];
    mapa.delete(a.id);
    mapa.set(r.id, fusionar(r, a, r.id));
    delRepo.splice(delRepo.indexOf(r), 1);
  }

  // Emparejamiento asimetrico: un lado tuvo colision (01 y 02 en el mismo lugar, re-clavados
  // con #NN) y el otro tiene uno solo de esos archivos, sin re-clavar. Las claves ya no
  // coinciden y el mismo script salia D5 y D6. Se une SOLO si del otro lado hay exactamente un
  // candidato con la misma clave de sufijo (el NN y el PRE: PRE-01 y 01 son scripts distintos):
  // con cero o varios, D5/D6 dicen la verdad.
  const otra = { repo: 'adjunto', adjunto: 'repo' };
  const unica = (x, fuente) => x.fuentes.length === 1 && x.fuentes[0] === fuente;
  for (const base of [...mapa.values()]) {
    if (!mapa.has(base.id) || base.fuentes.length !== 1 || String(base.id).includes('#') || base.orden == null) continue;
    const fuente = base.fuentes[0];
    const del = otra[fuente];
    const sufijo = `#${base.esPre ? 'pre-' : ''}${base.orden}`;
    const candidatos = [...mapa.values()].filter((x) =>
      x.idBase === base.id && unica(x, del) && String(x.id).endsWith(sufijo));
    if (candidatos.length !== 1) continue;
    const c = candidatos[0];
    const [deRepo, deAdjunto] = fuente === 'repo' ? [base, c] : [c, base];
    mapa.delete(base.id);
    mapa.set(c.id, fusionar(deRepo, deAdjunto, c.id));
  }

  // El __NEW va ULTIMO: un adjunto que tiene pareja exacta en el repo (mismo nombre, o el mismo
  // NN re-clavado) es de esa pareja. Corriendo antes, el __NEW se lo quedaba por el nombre del
  // modulo y dejaba un D12 falso y la pareja sola con D5.
  unirVersionesNuevas(mapa);

  return ordenarParaEjecucion([...mapa.values()]);
}

// Dos archivos DISTINTOS de la misma fuente (01 y 02) resuelven al mismo id, porque el NN no
// entra en idDeScript. Antes se re-clavaban mientras se fusionaban y el resultado dependia del
// orden de llegada: el 02 del repo podia cruzarse con el 01 de la tarjeta y mezclar contenidos.
// Se resuelve ANTES de fusionar, por cada fuente aparte, y el sufijo sale solo de los miembros
// del grupo, nunca del orden. El grupo es por FUENTE y no por lugar: si el 01 esta en otra
// tarjeta que el 02, agruparlo por lugar lo dejaba sin sufijo y se cruzaba con el 02 del repo.
export function desambiguar(entradas) {
  const clave = (e) => e.id;
  const grupos = new Map();
  for (const e of entradas) {
    if (!grupos.has(clave(e))) grupos.set(clave(e), []);
    grupos.get(clave(e)).push(e);
  }
  // La colision se decide sobre archivos DISTINTOS: el mismo nombre subido dos veces a la misma
  // task es una re-subida, no otro script. Esas entradas quedan como estan, se fusionan por el
  // camino normal (se mide el adjunto mas nuevo) y D12 muestra la diferencia de contenido.
  // El PRE entra en el sufijo porque PRE-01 y 01 son scripts distintos con el mismo NN: sin el,
  // el 01 de la tarjeta no coincidia con el 01 del repo.
  const archivo = (e) => String(e.archivo).toLowerCase().replace(/\s+/g, ' ').trim().replace(/\.sql$/, '');
  const porOrden = (e) => (e.orden != null ? `${e.esPre ? 'pre-' : ''}${e.orden}` : null);
  const sufijos = new Map();
  for (const [k, grupo] of grupos) {
    const distintos = new Map();
    for (const e of grupo) if (!distintos.has(archivo(e))) distintos.set(archivo(e), e);
    if (distintos.size === 1) continue;
    const cuenta = new Map();
    for (const e of distintos.values()) {
      const o = porOrden(e);
      if (o != null) cuenta.set(o, (cuenta.get(o) || 0) + 1);
    }
    const porArchivo = new Map();
    for (const [nombre, e] of distintos) {
      const o = porOrden(e);
      porArchivo.set(nombre, o != null && cuenta.get(o) === 1 ? o : nombre);
    }
    sufijos.set(k, porArchivo);
  }
  return entradas.map((e) => {
    const porArchivo = sufijos.get(clave(e));
    if (!porArchivo) return e;
    return { ...e, idBase: e.id, id: `${e.id}#${porArchivo.get(archivo(e))}` };
  });
}

// El mismo archivo sin id en el nombre adjunto a la User Story Y a la task de scripts de esa US
// se vincula a cada contenedor por separado y salia dos veces en pantalla. La US es el work
// item real; la task solo lo transporta. Se re-clava el id de las copias de las tasks al de la
// unica copia que NO cuelga de una task, y sumar las junta con su regla de siempre: versiones,
// D12 y el adjunto medido por la tupla (fecha, lugar, hash), sin depender del orden.
// Va ANTES de sumar y no despues: el repo de la carpeta US-xxxxx trae el mismo id que la copia
// de la US y se juntan por id; despues de sumar, la copia de la task quedaba sola.
// Con cero o dos o mas contenedores que no son task no se une: elegir seria adivinar. Una copia
// cuyo id tambien vino del repo no se mueve: ya tiene par.
// Una task se une solo a la US que NOMBRA (titulo US-24768_..., U-24768, US24768) o de la que
// cuelga. El sufijo del archivo solo no alcanza: el mismo sp_a.sql de la task de otra US se
// media como contenido de esta, con un D12 falso aca y un D5 falso alla.
function nombraLaUs(e, usId) {
  if (usId == null) return false;
  if (e.contenedorPadre != null && String(e.contenedorPadre) === String(usId)) return true;
  // El titulo tiene que nombrar UNA sola US y que sea esta: "US-1 y US-2" no dice de cual es
  // el archivo. El token arranca al principio o despues de algo que no es letra ni numero, para
  // que BUS-24768 o HU-24768 no cuenten.
  const ids = new Set();
  for (const m of String(e.contenedorTitulo || '').matchAll(/(?:^|[^A-Za-z0-9])US?-?(\d+)(?![0-9])/gi)) ids.add(String(Number(m[1])));
  return ids.size === 1 && ids.has(String(Number(usId)));
}

export function unirUsYTaskDeScripts(entradas, idsDelRepo = new Set()) {
  const sufijo = (id) => String(id).slice(String(id).indexOf('/') + 1);
  const grupos = new Map();
  for (const e of entradas) {
    if (e.vinculadoPor !== 'contenedor') continue;
    const k = sufijo(e.id);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
  }
  const destino = new Map();
  for (const grupo of grupos.values()) {
    if (new Set(grupo.map((e) => e.id)).size < 2) continue;
    const noTask = [...new Set(grupo.filter((e) => e.contenedorTipo !== 'Task').map((e) => e.id))];
    if (noTask.length !== 1) continue;
    const us = grupo.find((e) => e.id === noTask[0]);
    for (const e of grupo) {
      if (e.id !== us.id && !idsDelRepo.has(e.id) && nombraLaUs(e, us.wiId)) destino.set(e.id, us);
    }
  }
  return entradas.map((e) => {
    const us = e.vinculadoPor === 'contenedor' ? destino.get(e.id) : null;
    if (!us) return e;
    // El idBase es el de la copia de la US, nunca se pierde: sin el, si la copia de la task
    // ganaba la tupla, el registro #NN quedaba sin idBase y el emparejamiento asimetrico con el
    // repo dependia del orden de llegada.
    const { idBase, ...resto } = e;
    return {
      ...resto, id: us.id, wiId: us.wiId,
      ...(us.idBase != null ? { idBase: us.idBase } : {}),
      aliasDe: [...new Set([e.id, idBase].filter(Boolean))],
    };
  });
}

// El `X__NEW.sql` del repo es la copia commiteada del script que se adjunta con la convencion
// ([B-25017] - ... - ALTER.sql): mismo contenido, otro nombre. Sin esto el adjunto salia D6
// ("no esta versionado") y el __NEW D5, con el script commiteado. Se une con el adjunto del
// MISMO work item que tenga el mismo contenido o que defina el modulo X. Queda el registro del
// adjunto (id, contenido y work item), porque es el que se sube; el repo suma su fuente, su
// version (D12 si el cuerpo commiteado difiere) y su responsable. Solo con un candidato de cada
// lado: con cero o varios, elegir seria adivinar y D5 dice la verdad. Los candidatos se
// calculan todos antes de unir, asi el resultado no depende del orden de llegada.
function unirVersionesNuevas(mapa) {
  const soloDe = (x, fuente) => x.fuentes.length === 1 && x.fuentes[0] === fuente;
  const nuevos = [...mapa.values()].filter((x) => soloDe(x, 'repo') && x.esNew && x.wiId != null);
  const adjuntos = [...mapa.values()].filter((x) => soloDe(x, 'adjunto') && x.wiId != null);
  const candidatosDe = new Map();
  const reclamos = new Map();
  for (const n of nuevos) {
    const cs = adjuntos.filter((a) => a.wiId === n.wiId &&
      ((n.hash != null && a.hash === n.hash) || defineModulo(a.objetos, n.nombreSp)));
    candidatosDe.set(n.id, cs);
    for (const a of cs) reclamos.set(a.id, (reclamos.get(a.id) || 0) + 1);
  }
  for (const n of nuevos) {
    const cs = candidatosDe.get(n.id);
    if (cs.length !== 1 || reclamos.get(cs[0].id) !== 1) continue;
    const a = cs[0];
    const versiones = [...a.versiones, ...n.versiones];
    const aliases = [...new Set([...(a.aliases || []), n.id, ...(n.aliases || [])])].filter((x) => x !== a.id).sort();
    mapa.delete(n.id);
    mapa.set(a.id, {
      ...a,
      carpeta: a.carpeta ?? n.carpeta ?? null,
      aliases,
      fuentes: [...a.fuentes, 'repo'],
      ordenPorFuente: { ...a.ordenPorFuente, repo: null },
      responsables: { ...n.responsables, ...a.responsables },
      versiones,
      contenidoDistinto: new Set(versiones.map((v) => v.hash).filter(Boolean)).size > 1,
    });
  }
}

// Une un registro que solo vino del repo con uno que solo vino de la tarjeta. El work item y
// la carpeta los da el repo (la US); el contenido, el adjunto, que es lo que se sube al
// FileZilla. El id que no queda se guarda en aliases para que D1 lo encuentre en
// task.adjuntos, que tiene ids previos a la reconciliacion.
function fusionar(deRepo, deAdjunto, id) {
  const r = deRepo;
  const a = deAdjunto;
  const versiones = [...r.versiones, ...a.versiones];
  const aliases = [...new Set([...(r.aliases || []), r.id, a.id, ...(a.aliases || [])])].filter((x) => x !== id);
  return {
    ...r, ...a,
    id, wiId: r.wiId, carpeta: r.carpeta,
    aliases,
    contenedorPadre: r.contenedorPadre ?? null,
    fuentes: ['repo', 'adjunto'],
    ordenPorFuente: { adjunto: a.ordenPorFuente.adjunto, repo: r.ordenPorFuente.repo },
    responsables: { ...r.responsables, ...a.responsables },
    versiones,
    contenidoDistinto: new Set(versiones.map((v) => v.hash).filter(Boolean)).size > 1,
  };
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
