import { leerScriptDelRepo, REPO_POR_DEFECTO, CARPETA_POR_DEFECTO } from './fuentes/repoAdo.js';
import { esRespaldoViejo } from './fuentes/comun.js';
import { candidatosStageToDev, RAMA_STAGE_POR_DEFECTO } from './stageToDev.js';
import { esMismoNombre } from './enMain.js';
import { subidaDe } from './desvios/reglas.js';

// Control cruzado del PR stage -> main contra la medicion del sprint. Existe por un incidente:
// scripts commiteados en la carpeta de un sprint ANTERIOR y sin adjuntar a la tarjeta, que el
// panel nunca vio porque mira una sola carpeta. El PR no tiene ese punto ciego: trae todo lo
// que va a main, venga de la carpeta que venga. No mide ninguna base: compara listas.

// El link que se copia de ADO (.../_git/Api.Net/pullrequest/25801) o el numero suelto.
export function leerLinkDePr(texto) {
  const t = String(texto || '').trim();
  if (/^\d+$/.test(t)) return { repo: null, id: Number(t) };
  const m = /\/_git\/([^/?#]+)\/pullrequest\/(\d+)/i.exec(t);
  if (!m) return null;
  return { repo: decodeURIComponent(m[1]), id: Number(m[2]) };
}

// Orden de gravedad: lo que el panel no vio primero, porque es justo lo que nadie esta mirando.
const GRAVEDAD = ['otro-sprint', 'fuera-del-panel', 'contenido-distinto', 'no-en-pr', 'sin-commit'];

const QUE = {
  'otro-sprint': 'En el PR, el panel no lo midió',
  'fuera-del-panel': 'En el PR, el panel no lo midió',
  'contenido-distinto': 'Mismo script, otro contenido',
  'no-en-pr': 'En el panel, no en el PR',
  'sin-commit': 'En el panel, no en el PR',
};

// Devuelve los hallazgos y, aparte, lo que el PR trae de OTROS sprints sin ser de este: un
// stage -> main puede llevar varios sprints juntos (el 25611 llevo 09_01 y 09_02), y eso no es
// un error. Si es un hallazgo cuando el work item es de ESTE sprint: es el incidente que origino
// este control, un script commiteado en la carpeta equivocada.
// `soloCarpetaEquivocada`: el PR no trae la carpeta medida (es de otro sprint). Ahi es esperable
// que no traiga los scripts del sprint, asi que eso no se reporta; lo unico que se busca es lo de
// este sprint commiteado en otra carpeta, que es justo lo que ese PR podria estar escondiendo.
export function compararPrConPanel({ scriptsPr = [], scriptsPanel = [], wis = [], enMain = {}, sprint = null, soloCarpetaEquivocada = false }) {
  const wiDe = (id) => wis.find((w) => w.id === id) || null;
  const delSprint = new Set(wis.filter((w) => !w.fueraDelSprint).map((w) => w.id));
  const nombreDe = (p) => (p && p.nombre) || null;
  const usados = new Set();
  const out = [];
  const otrosSprints = [];
  const hallazgo = (tipo, sc, donde, porque, responsable) =>
    out.push({ tipo, que: QUE[tipo], archivo: sc.archivo, wiId: sc.wiId ?? null, donde, porque, responsable: responsable || null });
  // El panel conoce el script (tarjeta o medicion) pero el PR lo trae SOLO desde otra carpeta: se
  // commiteo donde no va. Que el contenido coincida no lo salva: es el mismo script, mal ubicado.
  const enOtraCarpeta = (p) => !!sprint && !!p.sprint && p.sprint !== sprint;
  const revisarCarpeta = (matches) => {
    if (!matches.length || !matches.every(enOtraCarpeta)) return;
    for (const p of matches) {
      hallazgo('otro-sprint', p, p.ruta,
        `Es un script de ${sprint} (lo conoce el panel) pero el PR lo trae desde la carpeta ${p.sprint}: va en la carpeta de su sprint.`,
        nombreDe(p.responsables?.commiteoEnElRepo));
    }
  };

  for (const s of scriptsPanel) {
    const porHash = s.hash != null ? scriptsPr.filter((p) => p.hash != null && p.hash === s.hash) : [];
    if (porHash.length) {
      porHash.forEach((p) => usados.add(p));
      revisarCarpeta(porHash);
      continue;
    }
    const porNombre = scriptsPr.filter((p) => esMismoNombre(s, p.archivo));
    if (porNombre.length) {
      porNombre.forEach((p) => usados.add(p));
      revisarCarpeta(porNombre);
      // Sin hash de uno de los dos lados no se puede afirmar que difieren: se da por visto.
      for (const p of porNombre) {
        if (s.hash == null || p.hash == null) continue;
        hallazgo('contenido-distinto', p, p.ruta,
          'El contenido que trae el PR no es el que midió el panel: se editó después o hay dos versiones.',
          nombreDe(p.responsables?.commiteoEnElRepo));
      }
      continue;
    }

    const wi = wiDe(s.wiId);
    // Lo que no va en la subida (cerrado o pausado) o ya llego a main no tiene por que venir.
    if (subidaDe(wi) || enMain[s.id] === 'igual') continue;
    if ((s.fuentes || []).includes('repo')) {
      hallazgo('no-en-pr', s, sprint ? `${sprint}/${s.carpeta || ''}` : (s.carpeta || 'repo'),
        'Está commiteado en dev pero no llegó a master: el PR no lo trae.',
        nombreDe(s.responsables?.commiteoEnElRepo) || wi?.asignadoA);
    } else {
      hallazgo('sin-commit', s, s.wiId != null ? `Tarjeta ${s.wiId}` : 'Tarjeta',
        'Solo está adjunto en la tarjeta: nunca se commiteó al repo.',
        nombreDe(s.responsables?.subioElAdjunto) || wi?.asignadoA);
    }
  }

  for (const p of scriptsPr) {
    if (usados.has(p)) continue;
    const quien = nombreDe(p.responsables?.commiteoEnElRepo);
    if (!sprint) {
      hallazgo('fuera-del-panel', p, p.ruta, 'La medición no tenía carpeta de sprint elegida: el panel no leyó el repo.', quien);
    } else if (p.sprint && p.sprint !== sprint) {
      if (p.wiId != null && delSprint.has(p.wiId)) {
        hallazgo('otro-sprint', p, p.ruta,
          `Es de un work item de ${sprint} pero está commiteado en la carpeta ${p.sprint}: va en su carpeta y adjunto a la tarjeta.`, quien);
      } else {
        otrosSprints.push({ archivo: p.archivo, wiId: p.wiId ?? null, donde: p.ruta, responsable: quien });
      }
    } else {
      hallazgo('fuera-del-panel', p, p.ruta,
        'Está en master pero no en la rama dev que lee el panel: entró directo a stage o se borró de dev.', quien);
    }
  }

  const hallazgos = soloCarpetaEquivocada ? out.filter((h) => h.tipo === 'otro-sprint') : out;
  return { hallazgos: hallazgos.sort((a, b) => GRAVEDAD.indexOf(a.tipo) - GRAVEDAD.indexOf(b.tipo)), otrosSprints };
}

// Lo que el PR trae en DB_Migrations, contado como lo cuenta una persona mirando la pestaña
// Files: sin este desglose, "20 scripts" contra "26 archivos" se lee como un error de medicion.
export function resumenDelDiff(cambios, carpeta = CARPETA_POR_DEFECTO) {
  const prefijo = `${carpeta}/`;
  const archivos = (cambios || []).filter((c) => c && c.item && !c.item.isFolder && String(c.item.path || '').startsWith(prefijo));
  const borrados = archivos.filter((c) => /delete/i.test(String(c.changeType || '')));
  const respaldos = archivos.filter((c) => !borrados.includes(c) && esRespaldoViejo(c.item.path));
  const rutas = candidatosStageToDev(cambios, carpeta);
  const porCarpeta = {};
  for (const r of rutas) {
    const partes = r.slice(prefijo.length).split('/');
    if (partes.length >= 3) porCarpeta[partes[0]] = (porCarpeta[partes[0]] || 0) + 1;
  }
  return { archivos: archivos.length, scripts: rutas.length, respaldos: respaldos.length, borrados: borrados.length, porCarpeta };
}

// Los .sql que trae el PR, leidos en el commit de origen: lo que el PR va a llevar a main, no
// lo que la rama tenga hoy.
async function scriptsDelPr(ado, pr, rutas, { repo, carpeta }) {
  const out = [];
  for (const ruta of rutas) {
    const rel = ruta.slice(carpeta.length + 1);
    const partes = rel.split('/');
    const carpetaWi = partes.length >= 3 ? partes[1] : partes[0];
    const sc = await leerScriptDelRepo(ado, { repo, rama: pr.commitOrigen, tipoVersion: 'commit', ruta, carpetaWi });
    out.push({ ...sc, ruta: rel, sprint: partes.length >= 3 ? partes[0] : null });
  }
  return out;
}

export async function analizarPr(ado, {
  prUrl, repo = REPO_POR_DEFECTO, carpeta = CARPETA_POR_DEFECTO,
  ramaStage = RAMA_STAGE_POR_DEFECTO, ramaMain = 'main',
  sprint = null, scripts = [], wis = [], enMain = {},
}) {
  const link = leerLinkDePr(prUrl);
  if (!link) throw new Error(`No reconozco el link del PR: pegá el link de Azure DevOps (…/_git/${repo}/pullrequest/NNNNN) o el número`);
  if (link.repo && link.repo.toLowerCase() !== String(repo).toLowerCase()) {
    throw new Error(`El PR es de ${link.repo}; los scripts se miden en ${repo}`);
  }
  const pr = await ado.obtenerPr(repo, link.id);
  if (!pr.commitOrigen || !pr.commitDestino) throw new Error(`Azure no devolvió los commits del merge del PR ${link.id}`);

  const avisos = [];
  if (pr.origen !== ramaStage || pr.destino !== ramaMain) {
    avisos.push(`El PR ${pr.id} va de ${pr.origen} a ${pr.destino}, no de ${ramaStage} a ${ramaMain}: se comparó igual.`);
  }

  if (pr.estado === 'completed') {
    avisos.push(`El PR ${pr.id} ya está completado: la comparación es histórica, contra lo que llevó a ${pr.destino} en su momento.`);
  }

  const cambios = await ado.diffEntreCommits(repo, pr.commitDestino, pr.commitOrigen);
  const resumen = resumenDelDiff(cambios, carpeta);
  const delPr = await scriptsDelPr(ado, pr, candidatosStageToDev(cambios, carpeta), { repo, carpeta });
  const prInfo = { id: pr.id, titulo: pr.titulo, estado: pr.estado, repo, origen: pr.origen, destino: pr.destino };

  // Comparar todo contra un sprint que el PR no trae llena la tabla de ruido: lo del sprint "no
  // esta en el PR" (medido el 2026-10-02 con el 25611 contra Sprint_2026_10_01: 44 hallazgos,
  // ninguno real). Pero no se puede dejar de mirar: si algo de ESTE sprint se commiteo en la
  // carpeta de otro, ese PR es justo el que lo trae.
  const sprintFuera = !!sprint && delPr.length > 0 && !delPr.some((p) => p.sprint === sprint);
  const { hallazgos, otrosSprints } = compararPrConPanel({
    scriptsPr: delPr, scriptsPanel: scripts, wis, enMain, sprint, soloCarpetaEquivocada: sprintFuera,
  });
  return { pr: prInfo, scripts: delPr.length, resumen, sprintFuera, hallazgos, otrosSprints, avisos };
}
