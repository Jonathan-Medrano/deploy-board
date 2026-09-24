import { rango } from './escalera.js';

const PESO = { bloqueante: 0, alto: 1, medio: 2 };
const MODULOS = new Set(['PROCEDURE', 'FUNCTION']);

const INVALIDOS = /[\\/:*?"<>|]/;
const ACENTOS = /[áéíóúÁÉÍÓÚñÑüÜ]/;

// D11 revisa la convencion despues de que el nombre parseo. El caso peligroso es el ultimo:
// " - " es el SEPARADOR, asi que un nombre que lo trae adentro de la descripcion no falla —
// parsea MAL en silencio, y el NN o la ACCION se leen del lugar equivocado.
export function problemasDeNombre(s) {
  const p = [];
  if (!s.accion) p.push('no termina en una ACCION valida (CREATE, ALTER, DROP, INSERT, UPDATE, DELETE)');
  if (!String(s.descripcion || '').trim()) p.push('no tiene descripcion');
  if (INVALIDOS.test(s.archivo)) p.push('tiene caracteres invalidos en Windows');
  if (ACENTOS.test(s.archivo)) p.push('tiene acentos o ñ');
  if (String(s.descripcion || '').includes(' - ')) p.push('tiene " - " dentro de la descripcion, que es el separador');
  return p;
}

// Un work item cerrado o pausado no forma parte de la subida. Cerrado (Closed o Done): se asume
// que ya esta en main. Pausado: no se ejecuta. Se clasifica por el estado, sin mayusculas.
export function subidaDe(wi) {
  const e = String((wi && wi.estado) || '').trim().toLowerCase();
  if (e === 'closed' || e === 'done') return 'cerrado';
  if (e === 'paused') return 'pausado';
  return null;
}

export function detectarDesvios({
  scripts = [], wis = [], tasks = [], estados = {}, destino = 'stage', ambientes = null,
  roles = { promocion: null, produccion: null },
}) {
  const out = [];
  const porId = new Map(wis.map((w) => [w.id, w]));

  // Un ambiente que no se midio no FALTA: no se pregunto. Sin esto, medir solo dev dejaba
  // cada PRE como "Falta un PRE en stage", un bloqueante afirmado sobre una base que nadie
  // consulto.
  const medido = (amb) => !ambientes || ambientes.includes(amb);

  // Quien EJECUTA depende del AMBIENTE, no de quien escribio el script. El dev corre sus
  // scripts donde esta desarrollando; lo que falta en el ambiente DESTINO lo corre el
  // encargado de la promocion (devToStage / stageToDev); y en produccion no ejecuta ningun
  // dev, ejecutan los encargados del deploy. `destino` ES la promocion: el reporte se
  // genera para promover hacia ese ambiente.
  const ejecutaEn = (ambiente, wi) => {
    if (ambiente === 'produccion') return roles.produccion || null;
    // Sin `roles.promocion` configurado esto devuelve null y NO cae al dueno del work item:
    // el autor no es quien ejecuta en el ambiente destino de una promocion, y ponerlo ahi
    // seria inventar un responsable — justo lo que roles.js promete no hacer. Un desvio sin
    // nombre se arregla configurando el rol; uno con el nombre equivocado manda a la persona
    // que no es y nadie se entera.
    if (ambiente === destino) return roles.promocion || null;
    return (wi && wi.asignadoA) || null;
  };

  // Los demas desvios no son de ejecucion: los arregla quien puede tocar ESA cosa. El que
  // commiteo tiene que adjuntar (D5), el que adjunto tiene que commitear (D6), el que lo
  // nombro tiene que renombrarlo (D7, D11), y el dueno del work item es el unico que sabe
  // que depende de que (D10).
  const responsableDe = (codigo, sc, wi, ambiente) => {
    const r = (sc && sc.responsables) || {};
    const subio = (r.subioElAdjunto && r.subioElAdjunto.nombre) || null;
    const commiteo = (r.commiteoEnElRepo && r.commiteoEnElRepo.nombre) || null;
    const dueno = (wi && wi.asignadoA) || null;
    if (codigo === 'D2' || codigo === 'D3' || codigo === 'D4') return ejecutaEn(ambiente, wi);
    if (codigo === 'D5') return commiteo || dueno;
    if (codigo === 'D6') return subio || dueno;
    if (codigo === 'D7' || codigo === 'D11') return subio || commiteo || dueno;
    return dueno || subio || commiteo;
  };

  // `ambiente` se DESESTRUCTURA afuera: sirve para elegir el responsable y no es parte del
  // Desvio. Spreadearlo junto al resto le agregaba un campo no documentado a la mitad de los
  // desvios, que ve cualquier consumidor que recorra las claves o serialice a JSON.
  const add = (codigo, severidad, titulo, detalle, extra = {}) => {
    const { ambiente, ...resto } = extra;
    const sc = resto.scriptId ? scripts.find((x) => x.id === resto.scriptId) : null;
    const wi = resto.wiId != null ? porId.get(resto.wiId) : null;
    out.push({
      codigo, severidad, titulo, detalle,
      responsable: responsableDe(codigo, sc, wi, ambiente),
      ...resto,
    });
  };

  for (const s of scripts) {
    const wi = s.wiId != null ? porId.get(s.wiId) : null;
    const est = estados[s.id] || {};
    const rDestino = est[destino]?.estado;

    // (D1 no va aca: es una propiedad del PAR task/work item, no del script. Ver abajo.)

    // D2 — divergencia entre ambientes, en CUALQUIER direccion. No privilegia ninguna:
    // que corra en stage y falte en dev significa que alguien lo ejecuto a mano salteando
    // el flujo, y ese caso es mas dificil de ver a ojo que el olvido clasico — nadie mira
    // un ambiente buscando algo que FALTA. Un "?" no cuenta: no se sabe, no se afirma.
    const corrio = Object.keys(est).filter((a) => est[a]?.estado === 'OK');
    const falta = Object.keys(est).filter((a) => est[a]?.estado === 'FALTA');
    // Los desvios de EJECUCION (D2, D3, D4) piden correr el script en algun lado. Si el work item
    // esta cerrado o pausado el script no va en la subida, y pedir que se corra es una orden
    // falsa. Lo que si importa de un pausado es lo contrario: que ya haya corrido (D13).
    const subida = subidaDe(wi);
    if (subida === 'pausado' && corrio.length) {
      add('D13', 'alto', `Pausado pero corrio en ${corrio.join(', ')}`,
        `${s.archivo} — el WI ${wi.id} esta en "${wi.estado}": no va en la subida, pero el script ya se ejecuto.`,
        { scriptId: s.id, wiId: s.wiId, corrioEn: corrio });
    }
    if (!subida && corrio.length && falta.length) {
      const rompeDestino = falta.includes(destino);
      add('D2', rompeDestino ? 'bloqueante' : 'alto',
        `Corrio en ${corrio.join(', ')} y falta en ${falta.join(', ')}`,
        rompeDestino
          ? `${s.archivo} — la promocion a ${destino} va a romper.`
          : `${s.archivo} — llego a ${corrio.join(', ')} sin pasar por ${falta.join(', ')}: se ejecuto a mano fuera del flujo, o ese ambiente se restauro de un backup viejo.`,
        { scriptId: s.id, wiId: s.wiId, ambiente: rompeDestino ? destino : falta[0] });
    }

    // D3 — un PRE que falta bloquea el deploy, no es una observacion.
    if (!subida && s.esPre && medido(destino) && rDestino !== 'OK') {
      add('D3', 'bloqueante', `Falta un PRE en ${destino}`,
        `${s.archivo} — los PRE corren ANTES de subir el codigo.`,
        { scriptId: s.id, wiId: s.wiId, ambiente: destino });
    }

    // D4 — el WI se dio por testeado con el script sin correr en stage. El ambiente va
    // HARDCODEADO a 'stage' y no sale de `destino` a proposito: en este proceso "Tested"
    // significa que QA valido en stage, sea cual sea la promocion que venga despues. Si
    // `destino` no es stage, el responsable cae al dueno del WI por el else de ejecutaEn,
    // que es correcto: no hay promocion hacia stage en curso.
    if (wi && !subida) {
      const rw = rango(wi.estado);
      if (rw != null && rw >= rango('Tested') && medido('stage') && est.stage?.estado !== 'OK') {
        add('D4', 'bloqueante', `WI ${wi.id} en "${wi.estado}" con un script sin correr en stage`,
          `${s.archivo} — stage dice "${est.stage?.estado ?? 'sin medir'}".`,
          { scriptId: s.id, wiId: wi.id, ambiente: 'stage' });
      }
    }

    // D5 / D6 — el desacuerdo entre fuentes ES el producto.
    const f = s.fuentes || [];
    if (f.includes('repo') && !f.includes('adjunto')) {
      add('D5', 'alto', 'Esta en el repo pero no adjunto: no se va a subir',
        `${s.archivo} — nadie lo va a encontrar al armar el paquete del FileZilla.`, { scriptId: s.id, wiId: s.wiId });
    }
    if (f.includes('adjunto') && !f.includes('repo')) {
      add('D6', 'alto', 'Esta adjunto pero no en el repo: no esta versionado',
        `${s.archivo} — sin commit no hay historia, ni autor, ni diff.`, { scriptId: s.id, wiId: s.wiId });
    }

    // D10 — el mismo script numerado distinto en la tarjeta y en el repo. NO renumera ni
    // elige en silencio: muestra las dos y recomienda la del repo, que paso por revision de
    // PR. Un orden equivocado es un script corriendo antes que su dependencia, y esa
    // decision la toma el dueno del work item. Solo se evalua si esta en las DOS fuentes:
    // con una sola numeracion no hay con que comparar.
    const op = s.ordenPorFuente || {};
    if (f.includes('adjunto') && f.includes('repo') && op.adjunto != null && op.repo != null && op.adjunto !== op.repo) {
      add('D10', 'alto',
        `Numerado ${op.adjunto} en la tarjeta y ${op.repo} en el repo`,
        `${s.archivo} — manda el del repo, pero confirmalo antes de ejecutar: el orden decide que corre primero.`,
        { scriptId: s.id, wiId: s.wiId });
    }

    // D12 — el mismo script con contenido distinto en dos lugares. No se elige en silencio:
    // se dice donde esta cada version y cual se midio, y el dueno las unifica.
    if (s.contenidoDistinto) {
      const donde = (s.versiones || []).map((v) => `${v.fuente} ${v.donde ?? '?'}`).join(', ');
      // "Mas reciente" es un dato REAL solo si el adjunto medido trae `creado`: sin fecha no
      // hay con que comparar y afirmar que es la mas nueva seria inventar un orden que nunca
      // se midio.
      const medida = f.includes('adjunto')
        ? (s.creado ? 'la del adjunto mas reciente' : 'la del adjunto')
        : 'la del repo';
      add('D12', 'alto', 'El mismo script tiene contenido distinto en dos lugares',
        `${s.archivo} — versiones en: ${donde}. Se midio ${medida}.`,
        { scriptId: s.id, wiId: s.wiId });
    }

    // D7 — sin id en el nombre. Si se pudo vincular por el contenedor ya no es huerfano, asi
    // que baja a medio y el texto lo dice: el nombre igual hay que arreglarlo, pero el script
    // no quedo sin tarjeta.
    // Un X__NEW.sql no pasa por D7 ni D11: su nombre ES la convencion del equipo para la copia
    // commiteada de un SP. Si quedo sin pareja, D5 ya dice lo que hay que hacer.
    if (s.esNew) continue;
    if (s.wiId == null) {
      add('D7', 'alto', 'El nombre no trae work item y no se pudo vincular',
        `${s.archivo} — renombralo con la convencion [<T|B|U>-<id>].`, { scriptId: s.id });
    } else if (s.vinculadoPor === 'contenedor') {
      add('D7', 'medio', 'El nombre no trae work item: se vinculo por el contenedor',
        `${s.archivo} — quedo colgado del WI ${s.wiId}. Renombralo con [<T|B|U>-<id>] para que el vinculo no dependa de donde este adjunto.`,
        { scriptId: s.id, wiId: s.wiId });
    }

    // D11 — el nombre parsea pero incumple la convencion en otra cosa.
    const problemas = problemasDeNombre(s);
    if (problemas.length) {
      add('D11', 'medio', 'El nombre no respeta la convencion',
        `${s.archivo} — ${problemas.join('; ')}.`, { scriptId: s.id, wiId: s.wiId });
    }
  }

  // D1 — la task contenedora quedo atras del work item. Es una propiedad del PAR
  // (task, work item), NO del script: emitirla dentro del loop de scripts producia una entrada
  // identica por cada script que la task contiene, inflaba el contador de bloqueantes y le
  // mostraba al responsable N veces la MISMA accion (mover la misma task al mismo estado).
  // Se emite una vez por par, recorriendo las tasks.
  // Los ids en task.adjuntos son pre-reconciliacion; el script emparejado puede tener otro id
  // pero guarda el viejo en aliases para que este lookup lo encuentre. Uno re-clavado por
  // colision (01 y 02 en la misma tarjeta) guarda el suyo en idBase.
  for (const t of tasks) {
    const rt = rango(t.estado);
    if (rt == null) continue;

    const wisDeLaTask = new Set();
    for (const sid of t.adjuntos || []) {
      const sc = scripts.find((x) => x.id === sid || x.idBase === sid || (x.aliases || []).includes(sid));
      if (sc && sc.wiId != null) wisDeLaTask.add(sc.wiId);
    }

    for (const wiId of wisDeLaTask) {
      const wi = porId.get(wiId);
      // Un WI traido de fuera del sprint no es el dueno de esta task: la task es del sprint y el
      // WI solo aparece porque un script lo nombra (B-25038: task activa, bug cerrado en otro
      // sprint). Pedir mover la task a su estado seria una orden falsa, y bloqueante.
      if (!wi || wi.fueraDelSprint) continue;
      const rw = rango(wi.estado);
      if (rw == null || rw <= rt) continue;
      // Un WI cerrado o pausado no va en la subida: el desvio queda como prolijidad, sin bloquear.
      add('D1', subidaDe(wi) ? 'medio' : 'bloqueante',
        `La task de SCRIPTS quedo en "${t.estado}" y el WI ${wi.id} ya esta en "${wi.estado}"`,
        `El trabajo se dio por testeado pero su task contenedora (${t.id}) no se movio.`,
        { wiId: wi.id, taskId: t.id, accion: { tipo: 'setEstado', id: t.id, valor: wi.estado } });
    }
  }

  // D8 / D9 — los campos Custom son un reclamo, no un dato: se contrastan contra los scripts.
  for (const wi of wis) {
    const suyos = scripts.filter((s) => s.wiId === wi.id);
    if (!suyos.length) continue;

    // D8 no se evalua para un WI de fuera del sprint: solo se ven los scripts suyos que cayeron en
    // este sprint, y proponer ese conteo como CantidadScripts escribiria un valor falso.
    if (!wi.fueraDelSprint && wi.cantidadScripts != null && Number(wi.cantidadScripts) !== suyos.length) {
      add('D8', 'medio', `CantidadScripts dice ${wi.cantidadScripts} y hay ${suyos.length}`,
        `WI ${wi.id} — ${wi.titulo}`,
        { wiId: wi.id, accion: { tipo: 'setCampos', id: wi.id, valor: { 'Custom.CantidadScripts': suyos.length } } });
    }

    const tieneModulo = suyos.some((s) => (s.objetos || []).some((o) => MODULOS.has(o.tipo)));
    // D9 NO propone un valor. El campo distingue "1 - Nuevo" de "2 - Cambio" segun si el
    // procedure YA existe en la base, y eso este modulo no lo sabe: `estados` trae el veredicto
    // del SCRIPT entero, no la existencia de un objeto suelto. Sugerir uno de los dos seria
    // inventar justo el tipo de dato que este sistema existe para no inventar — asi que se
    // reporta el desvio y la eleccion queda en la persona.
    if (tieneModulo && wi.tieneSP === '0 - No') {
      add('D9', 'medio', 'TieneSP dice "0 - No" pero los scripts definen un procedure o una function',
        `WI ${wi.id} — ${wi.titulo}. Elegi "1 - Nuevo" si el objeto no existia, o "2 - Cambio" si ya estaba.`,
        { wiId: wi.id });
    }
  }

  return out.sort((a, b) => PESO[a.severidad] - PESO[b.severidad] || a.codigo.localeCompare(b.codigo));
}
