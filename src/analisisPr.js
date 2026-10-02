import { leerScriptDelRepo, REPO_POR_DEFECTO, CARPETA_POR_DEFECTO } from './fuentes/repoAdo.js';
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

export function compararPrConPanel({ scriptsPr = [], scriptsPanel = [], wis = [], enMain = {}, sprint = null }) {
  const wiDe = (id) => wis.find((w) => w.id === id) || null;
  const nombreDe = (p) => (p && p.nombre) || null;
  const usados = new Set();
  const out = [];
  const hallazgo = (tipo, sc, donde, porque, responsable) =>
    out.push({ tipo, que: QUE[tipo], archivo: sc.archivo, wiId: sc.wiId ?? null, donde, porque, responsable: responsable || null });

  for (const s of scriptsPanel) {
    const porHash = s.hash != null ? scriptsPr.filter((p) => p.hash != null && p.hash === s.hash) : [];
    if (porHash.length) {
      porHash.forEach((p) => usados.add(p));
      continue;
    }
    const porNombre = scriptsPr.filter((p) => esMismoNombre(s, p.archivo));
    if (porNombre.length) {
      porNombre.forEach((p) => usados.add(p));
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
      hallazgo('otro-sprint', p, p.ruta,
        `Está commiteado en la carpeta ${p.sprint}; el panel mide ${sprint}. Si es de este sprint, va en su carpeta y adjunto a la tarjeta.`, quien);
    } else {
      hallazgo('fuera-del-panel', p, p.ruta,
        'Está en master pero no en la rama dev que lee el panel: entró directo a stage o se borró de dev.', quien);
    }
  }

  return out.sort((a, b) => GRAVEDAD.indexOf(a.tipo) - GRAVEDAD.indexOf(b.tipo));
}

// Los .sql que trae el PR, leidos en el commit de origen: lo que el PR va a llevar a main, no
// lo que la rama tenga hoy.
async function scriptsDelPr(ado, pr, { repo, carpeta }) {
  const rutas = candidatosStageToDev(await ado.diffEntreCommits(repo, pr.commitDestino, pr.commitOrigen), carpeta);
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

  const delPr = await scriptsDelPr(ado, pr, { repo, carpeta });
  return {
    pr: { id: pr.id, titulo: pr.titulo, estado: pr.estado, repo, origen: pr.origen, destino: pr.destino },
    scripts: delPr.length,
    hallazgos: compararPrConPanel({ scriptsPr: delPr, scriptsPanel: scripts, wis, enMain, sprint }),
    avisos,
  };
}
