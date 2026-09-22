import { detectarDesvios } from './desvios/reglas.js';
import { ordenarParaEjecucion } from './reconciliador/index.js';
import { rango } from './desvios/escalera.js';

// D5, D6 y D10 no se leen bien como filas sueltas: un script que falta y otro que sobra en
// la misma User Story son EL MISMO problema visto de los dos lados, y separarlos obliga a
// reconstruir la relacion a mano. Se colapsan en un bloque por work item.
export function agruparRevisarAMano(desvios, scripts, wis) {
  const DEL_BLOQUE = new Set(['D5', 'D6', 'D10']);
  const grupos = new Map();

  for (const d of desvios) {
    if (!DEL_BLOQUE.has(d.codigo) || d.wiId == null) continue;

    if (!grupos.has(d.wiId)) {
      const wi = wis.find((w) => w.id === d.wiId) || null;
      const suyos = scripts.filter((x) => x.wiId === d.wiId);
      const r = rango(wi && wi.estado);
      grupos.set(d.wiId, {
        wiId: d.wiId,
        titulo: (wi && wi.titulo) || '',
        enLaTarjeta: suyos.filter((x) => (x.fuentes || []).includes('adjunto')).length,
        enElRepo: suyos.filter((x) => (x.fuentes || []).includes('repo')).length,
        // Un desvio que no bloquea la subida de hoy no puede gritar igual que uno que si.
        afectaEstePase: r != null && r >= rango('Tested'),
        soloEnLaTarjeta: [], soloEnElRepo: [], numeradosDistinto: [],
        responsable: d.responsable || null,
      });
    }

    const g = grupos.get(d.wiId);
    const sc = scripts.find((x) => x.id === d.scriptId);
    if (!sc) continue;
    if (d.codigo === 'D6') g.soloEnLaTarjeta.push(sc.archivo);
    else if (d.codigo === 'D5') g.soloEnElRepo.push(sc.archivo);
    else g.numeradosDistinto.push({
      archivo: sc.archivo,
      tarjeta: (sc.ordenPorFuente || {}).adjunto,
      repo: (sc.ordenPorFuente || {}).repo,
    });
    if (!g.responsable && d.responsable) g.responsable = d.responsable;
  }

  return [...grupos.values()];
}

export function construirReporte({
  scripts, wis, tasks, estados,
  destino = 'stage', ambientes = ['dev', 'stage'],
  roles = { promocion: null, produccion: null },
}) {
  // `roles` se REENVIA. Sin esto las reglas de ejecucion corren siempre con roles vacios y
  // todos los desvios de D2/D3/D4 salen sin responsable, configure el equipo lo que configure:
  // rolesDesde() y el parametro de detectarDesvios existirian sin que nada los conecte.
  const desvios = detectarDesvios({ scripts, wis, tasks, estados, destino, roles });
  const bloqueantes = desvios.filter((d) => d.severidad === 'bloqueante').length;

  const sinVeredicto = [];
  for (const s of scripts) {
    for (const amb of ambientes) {
      const e = estados[s.id]?.[amb];
      if (e && (e.estado === '?' || e.estado === 'PARCIAL')) {
        sinVeredicto.push({ scriptId: s.id, archivo: s.archivo, ambiente: amb, estado: e.estado, motivo: e.nota || 'sin motivo registrado' });
      }
    }
  }

  return {
    destino, ambientes, desvios, bloqueantes,
    listoParaSubir: bloqueantes === 0,
    orden: ordenarParaEjecucion(scripts),
    // El agrupado por responsable es parte del MODELO, no del formateo: asi se puede testear
    // sin parsear texto, y una UI futura lo consume sin volver a derivarlo.
    pendientesPorResponsable: agruparPorResponsable(desvios),
    revisarAMano: agruparRevisarAMano(desvios, scripts, wis),
    estados, wis, tasks, sinVeredicto,
  };
}

// Quien figura al lado de un script. El dueno de la tarjeta manda sobre quien subio el
// archivo: el que adjunta puede ser un companero que paso el .sql, y el que responde por el
// trabajo es el asignado. Se exporta porque la consola y la pantalla tienen que decir el
// MISMO nombre; dos derivaciones paralelas divergen en el primer caso raro.
export function responsableDe(script, wis = []) {
  const wi = wis.find((w) => w.id === script.wiId);
  return wi?.asignadoA
    || script.responsables?.subioElAdjunto?.nombre
    || script.responsables?.commiteoEnElRepo?.nombre
    || null;
}

// El nombre completo de un script mide ~90 caracteres y no entra en una fila. No hace falta:
// el prefijo [U-xxxxx], el PRE y el sufijo - ALTER YA son columnas propias, asi que repetirlos
// dentro del nombre es ruido. `descripcion` que devuelve parsearNombre es justo la parte humana.
const recortar = (s, n) => {
  const t = String(s ?? '');
  return t.length <= n ? t.padEnd(n) : t.slice(0, n - 1) + '…';
};

// "Ana Maria Gonzalez" -> "Ana M. Gonzalez" cuando no entra entero. Se abrevia el medio,
// nunca el apellido: en un equipo chico el apellido es lo que desambigua.
function abreviarNombre(n, ancho) {
  const s = String(n ?? '');
  if (!s || s.length <= ancho) return s;
  const p = s.split(/\s+/).filter(Boolean);
  if (p.length < 3) return s;
  return [p[0], ...p.slice(1, -1).map((x) => x[0] + '.'), p[p.length - 1]].join(' ');
}

// El semaforo resume la fila para que no haya que comparar columnas de a una.
export function semaforoDe(script, desvios, estados, ambientes) {
  // Un desvio sin `scriptId` (D1, D8, D9) no es de ESTE script pero si de su work item, y
  // tiene que pintar sus filas: si no, la fila sale verde mientras el encabezado grita que
  // hay bloqueantes, y el que mira la tabla no encuentra cual.
  const mios = desvios.filter((d) =>
    d.scriptId === script.id ||
    (d.scriptId == null && d.wiId != null && d.wiId === script.wiId));
  if (mios.some((d) => d.severidad === 'bloqueante')) return '⛔';
  const est = estados[script.id] || {};
  const todoVerde = ambientes.every((a) => est[a]?.estado === 'OK');
  return mios.length || !todoVerde ? '🟠' : '✅';
}

// Cada codigo se traduce al VERBO que resuelve el desvio. Un diagnostico dice que esta mal;
// un verbo dice quien hace que. La lista por responsable existe para lo segundo.
export function accionDe(d) {
  switch (d.codigo) {
    case 'D1':  return `Mover la task de SCRIPTS a "${d.accion?.valor ?? 'el estado de la US'}"`;
    case 'D2':  return 'Ejecutar en el ambiente que falta';
    case 'D3':  return 'Ejecutar el PRE ANTES del deploy';
    case 'D4':  return 'Ejecutar en stage: la US ya se dio por testeada';
    case 'D5':  return 'Adjuntar el script a la tarjeta';
    case 'D6':  return 'Commitear el script al repo';
    case 'D7':  return 'Renombrar con la convencion [U-xxxxx]';
    case 'D8':  return 'Corregir CantidadScripts en la US';
    case 'D9':  return 'Corregir TieneSP en la US';
    case 'D10': return 'Confirmar la numeracion: tarjeta contra repo';
    default:    return d.titulo;
  }
}

const PESO = { bloqueante: 0, alto: 1, medio: 2 };

// D2, D3 y D4 sobre el MISMO script son tres razones para UNA sola accion: ejecutarlo donde
// falta. Listarlas por separado le muestra a la persona tres tareas donde hay una — y le hace
// leer tres veces el mismo nombre de archivo para descubrir que es el mismo problema.
const EJECUCION = new Set(['D2', 'D3', 'D4']);

export function agruparPorResponsable(desvios) {
  const grupos = new Map();
  for (const d of desvios) {
    const quien = d.responsable || '(sin responsable identificado)';
    if (!grupos.has(quien)) grupos.set(quien, { responsable: quien, pendientes: [] });
    const g = grupos.get(quien);

    const yaEsta = EJECUCION.has(d.codigo) && d.scriptId
      ? g.pendientes.find((p) => EJECUCION.has(p.codigo) && p.scriptId === d.scriptId)
      : null;

    if (yaEsta) {
      yaEsta.motivos.push(d.detalle);
      // Gana la severidad mas alta: si una de las tres razones bloquea, la accion bloquea.
      if (PESO[d.severidad] < PESO[yaEsta.severidad]) {
        yaEsta.severidad = d.severidad;
        yaEsta.codigo = d.codigo;
        yaEsta.accion = accionDe(d);
      }
      continue;
    }

    g.pendientes.push({
      codigo: d.codigo, severidad: d.severidad, scriptId: d.scriptId ?? null,
      accion: accionDe(d), motivos: [d.detalle],
    });
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, pendientes: g.pendientes.sort((a, b) => PESO[a.severidad] - PESO[b.severidad]) }))
    .sort((a, b) => PESO[a.pendientes[0].severidad] - PESO[b.pendientes[0].severidad] || b.pendientes.length - a.pendientes.length);
}

const GLIFO = { bloqueante: '⛔', alto: '🟠', medio: '🟡' };

// Cuando una accion junta varios motivos, el nombre del archivo se repite en cada uno. Se
// imprime UNA vez y abajo solo las razones: tres lineas con el mismo nombre adelante son
// exactamente el ruido que esta seccion existe para sacar. Si los motivos no comparten
// prefijo, se imprimen tal cual — no se recorta nada que el lector necesite.
export function lineasDeMotivos(motivos) {
  if (motivos.length === 1) return [motivos[0]];
  const partes = motivos.map((m) => m.split(' — '));
  const prefijo = partes[0][0];
  if (!partes.every((p) => p.length > 1 && p[0] === prefijo)) return motivos;
  return [prefijo, ...partes.map((p) => '  · ' + p.slice(1).join(' — '))];
}

export function formatearReporte(r) {
  const L = [];
  L.push(r.listoParaSubir
    ? '✅ LISTO PARA SUBIR — cero bloqueantes'
    : `⛔ ${r.bloqueantes} BLOQUEANTES — no subas todavia`);
  L.push('');
  L.push(`Destino: ${r.destino} · Ambientes medidos: ${r.ambientes.join(', ')}`);
  L.push('Produccion NO se midio: no se sondea nunca. Su estado sale de la bitacora (plan 2).');
  L.push('');

  const AMB = 7;
  const cabecera = '      #  WI      TIPO   ' + recortar('SCRIPT', 30) + ' ' + recortar('ACCION', 7) +
    r.ambientes.map((a) => ' ' + recortar(a.toUpperCase(), AMB)).join('') + ' RESPONSABLE';
  L.push(cabecera);
  L.push(' ' + '─'.repeat(cabecera.length));

  r.orden.forEach((s, i) => {
    const quien = responsableDe(s, r.wis) || '';
    const cols = r.ambientes
      .map((a) => ' ' + recortar(r.estados[s.id]?.[a]?.estado ?? '-', AMB))
      .join('');
    L.push(
      `  ${semaforoDe(s, r.desvios, r.estados, r.ambientes)}  ${String(i + 1).padStart(2)}  ` +
      `${recortar(s.wiId ?? '?', 6)}  ${recortar(s.esPre ? 'PRE' : '', 5)}  ` +
      `${recortar(s.descripcion || s.archivo, 30)} ${recortar(s.accion ?? '', 7)}${cols} ` +
      abreviarNombre(quien, 18)
    );
  });

  const porQuien = r.pendientesPorResponsable;
  if (porQuien.length) {
    L.push('');
    L.push('QUE LE FALTA A CADA UNO');
    for (const g of porQuien) {
      L.push('');
      L.push(`  ${g.responsable}  ·  ${g.pendientes.length} pendiente${g.pendientes.length > 1 ? 's' : ''}`);
      for (const p of g.pendientes) {
        L.push(`    ${GLIFO[p.severidad]} ${p.accion}`);
        for (const linea of lineasDeMotivos(p.motivos)) L.push(`         ${linea}`);
      }
    }
  }
  for (const g of r.revisarAMano) {
    L.push('');
    L.push(`REVISAR A MANO — US ${g.wiId}: la tarjeta y el repo no coinciden`);
    L.push(`  (${g.afectaEstePase ? 'afecta a ESTE pase' : 'afecta al PROXIMO pase, no a este'})`);
    L.push(`  La tarjeta tiene ${g.enLaTarjeta} adjuntos y el repo ${g.enElRepo} scripts.`);
    for (const a of g.soloEnLaTarjeta) L.push(`   · En la tarjeta y no en el repo:  ${a}`);
    for (const a of g.soloEnElRepo) L.push(`   · En el repo y no en la tarjeta:  ${a}`);
    for (const n of g.numeradosDistinto) {
      L.push(`   · Numerado distinto: ${n.tarjeta} en la tarjeta contra ${n.repo} en el repo. Manda el del repo.`);
      L.push(`     ${n.archivo}`);
    }
    L.push(`  Quien lo tiene que revisar: ${g.responsable || '(sin responsable identificado)'}`);
  }

  if (r.sinVeredicto.length) {
    L.push('');
    L.push('SIN VEREDICTO FIRME (no asumir que corrio)');
    for (const s of r.sinVeredicto) L.push(`  ${s.archivo} en ${s.ambiente}: ${s.estado} — ${s.motivo}`);
  }
  return L.join('\n');
}
