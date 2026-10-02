const API = 'api-version=7.0';

export const LARGO_MAXIMO_DESCRIPCION = 4000;
const MAXIMO_COMMITS = 50;

// La UNICA escritura del sistema en Azure. Vive aparte del cliente de lectura a proposito: la
// medicion no tiene por que poder crear nada, y el test que garantiza que el cliente solo lee
// sigue valiendo.

export function descripcionDelPr({ quien = null, commits = [], pendientes = commits.length }) {
  const listados = commits.slice(0, MAXIMO_COMMITS);
  const lineas = [`Creado desde deploy-board${quien ? ` por ${quien}` : ''}.`, ''];
  for (const c of listados) lineas.push(`- ${c.id} ${c.mensaje}${c.autor ? ` (${c.autor})` : ''}`);
  if (pendientes > listados.length) lineas.push(`- y ${pendientes - listados.length} más`);
  const texto = lineas.join('\n');
  return texto.length <= LARGO_MAXIMO_DESCRIPCION ? texto : texto.slice(0, LARGO_MAXIMO_DESCRIPCION - 1) + '…';
}

function error(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

export async function crearPr(env, { repo, origen, destino, titulo, descripcion = '' }, deps = {}) {
  const org = env.AZURE_ORG || env.AZURE_ORG_URL;
  const project = env.AZURE_PROJECT;
  const pat = env.AZURE_PAT;
  if (!pat) throw new Error('Falta AZURE_PAT en deploy-board/.env.');
  if (!org || !project) throw new Error('Faltan AZURE_ORG o AZURE_PROJECT en deploy-board/.env.');
  const http = deps.fetch || fetch;
  const base = `${String(org).replace(/\/+$/, '')}/${encodeURIComponent(project)}`;

  // Sin reintento: el cliente de lectura reintenta porque repetir una lectura no cambia nada;
  // repetir este POST crearia dos PR.
  const res = await http(`${base}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests?${API}`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(':' + pat).toString('base64'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceRefName: `refs/heads/${origen}`,
      targetRefName: `refs/heads/${destino}`,
      title: titulo,
      description: String(descripcion).slice(0, LARGO_MAXIMO_DESCRIPCION),
    }),
  });
  if (res.status === 401 || res.status === 403) throw error(403, `El PAT no tiene permiso para crear PRs en ${repo} (Azure ${res.status}).`);
  if (res.status === 409) throw error(409, `Azure dice que ya hay un PR activo de ${origen} a ${destino} en ${repo}: medí de nuevo para ver el link.`);
  // El motivo de Azure (una policy de rama, origen igual a destino) es lo unico que le dice al
  // usuario por que no se creo. No trae el PAT: es el texto del rechazo.
  if (!res.ok) {
    const motivo = ((await res.json().catch(() => ({}))) || {}).message;
    throw error(502, `Azure ${res.status} ${res.statusText} al crear el PR en ${repo}${motivo ? `: ${motivo}` : '.'}`);
  }
  const pr = await res.json().catch(() => ({}));
  if (!pr || pr.pullRequestId == null) throw error(502, `Azure contestó ${res.status} pero no devolvió el número del PR en ${repo}: revisalo en Azure antes de volver a crear.`);
  return { id: pr.pullRequestId, link: `${base}/_git/${encodeURIComponent(repo)}/pullrequest/${pr.pullRequestId}` };
}
