const API = 'api-version=7.0';

export function crearClienteAdo(env = process.env, deps = {}) {
  // El equipo ya tiene la organizacion en AZURE_ORG_URL: se acepta ese nombre en vez de
  // obligar a duplicar la misma URL con otra clave, que es como se desincronizan.
  const org = env.AZURE_ORG || env.AZURE_ORG_URL;
  const project = env.AZURE_PROJECT;
  const pat = env.AZURE_PAT;
  const http = deps.fetch || fetch;

  if (!pat) throw new Error('Falta AZURE_PAT en deploy-board/.env — copialo de .env.example y completalo a mano.');
  if (!org || !project) throw new Error('Faltan AZURE_ORG o AZURE_PROJECT en deploy-board/.env.');

  const auth = 'Basic ' + Buffer.from(':' + pat).toString('base64');

  // El mensaje de error nunca incluye el cuerpo del request ni la cabecera: ahi viaja el PAT.
  async function api(url, opts = {}) {
    const res = await http(url, {
      ...opts,
      headers: { Authorization: auth, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error(`Azure ${res.status} ${res.statusText} en ${url.split('?')[0]}`);
    return res;
  }

  async function wiql(consulta) {
    const url = `${org}/${encodeURIComponent(project)}/_apis/wit/wiql?${API}`;
    const res = await api(url, { method: 'POST', body: JSON.stringify({ query: consulta }) });
    return ((await res.json()).workItems || []).map((w) => Number(w.id));
  }

  async function getWorkItems(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const url = `${org}/_apis/wit/workitems?ids=${lote.join(',')}&$expand=relations&${API}`;
      out.push(...(((await (await api(url)).json()).value) || []));
    }
    return out;
  }

  async function descargarAdjunto(url) {
    const res = await api(url.includes('?') ? url : `${url}?${API}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async function setEstado(id, estado) {
    const url = `${org}/_apis/wit/workitems/${id}?${API}`;
    const body = [{ op: 'add', path: '/fields/System.State', value: estado }];
    return (await api(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(body) })).json();
  }

  async function setCampos(id, campos) {
    const entradas = Object.entries(campos || {}).filter(([, v]) => v != null && v !== '');
    // La comparacion va en minusculas porque ADO resuelve los reference names sin distinguir
    // mayusculas: un guard con `k === 'System.State'` lo esquiva cualquiera que escriba
    // `system.state`, y esta es la UNICA frontera que impide que la automatizacion mueva el
    // estado de una tarjeta. Un guard que se saltea escribiendo distinto no es un guard.
    if (entradas.some(([k]) => String(k).toLowerCase() === 'system.state')) {
      throw new Error('setCampos no toca System.State: para eso esta setEstado, y solo sobre la task contenedora.');
    }
    if (!entradas.length) return null;
    const url = `${org}/_apis/wit/workitems/${id}?${API}`;
    const body = entradas.map(([path, value]) => ({ op: 'add', path: `/fields/${path}`, value }));
    return (await api(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(body) })).json();
  }

  // La identidad de quien subio un adjunto NO esta en los atributos de la relacion
  // AttachedFile — medido el 2026-09-22 contra el WI 25034: traen resourceCreatedDate y
  // resourceSize, pero ninguna persona. Sale del historial de revisiones, donde cada
  // revision que agrega la relacion expone revisedBy. Un archivo resubido aparece varias
  // veces (Ana renombro y resubio el mismo script 3 veces): gana la ultima revision.
  async function quienSubioCadaAdjunto(id) {
    const url = `${org}/_apis/wit/workitems/${id}/updates?${API}`;
    const revisiones = ((await (await api(url)).json()).value) || [];
    const out = {};
    for (const u of revisiones) {
      for (const r of (u.relations && u.relations.added) || []) {
        if (r.rel !== 'AttachedFile') continue;
        const nombre = (r.attributes || {}).name;
        if (nombre) out[nombre] = u.revisedBy && u.revisedBy.displayName
          ? { nombre: u.revisedBy.displayName, email: u.revisedBy.uniqueName || null }
          : null;
      }
    }
    return out;
  }

  // --- Git de ADO: leer DB_Migrations sin tener el repo clonado ---
  // Antes esto salia de una carpeta en disco, lo que obligaba a cada dev a tener el Api.Net
  // al lado Y actualizado. Medido el 2026-09-22: un clon local desactualizado reportaba que
  // Sprint_2026_09_02 "no existia" cuando en la rama si estaba. Leer del origen no se
  // desactualiza.
  const git = (repo) => `${org}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}`;

  async function listarArchivos(repo, carpeta, rama) {
    const url = `${git(repo)}/items?scopePath=${encodeURIComponent(carpeta)}` +
      `&recursionLevel=Full&versionDescriptor.version=${encodeURIComponent(rama)}&${API}`;
    return (((await (await api(url)).json()).value) || []).map((i) => ({ ruta: i.path, esCarpeta: !!i.isFolder }));
  }

  async function descargarArchivo(repo, ruta, rama) {
    const url = `${git(repo)}/items?path=${encodeURIComponent(ruta)}` +
      `&versionDescriptor.version=${encodeURIComponent(rama)}&$format=octetStream&${API}`;
    return Buffer.from(await (await api(url)).arrayBuffer());
  }

  // Quien commiteo el archivo. Es el responsable a nombrar cuando el script esta en el repo
  // y no esta adjunto en la tarjeta: es el que tiene que subirlo. Un fallo no es un error del
  // barrido — devuelve null y el desvio sale sin nombre, nunca con uno inventado.
  async function ultimoCommitDe(repo, ruta) {
    try {
      const url = `${git(repo)}/commits?searchCriteria.itemPath=${encodeURIComponent(ruta)}` +
        `&searchCriteria.$top=1&${API}`;
      const c = (((await (await api(url)).json()).value) || [])[0];
      if (!c || !c.author) return null;
      return { nombre: c.author.name || null, email: c.author.email || null, fecha: (c.author.date || '').slice(0, 10) || null };
    } catch {
      return null;
    }
  }

  // Todas las firmas (nombre + mail) que dejaron commits en la carpeta. No es para nombrar a
  // nadie: es el material para unir los nombres distintos de una misma persona.
  async function autoresDe(repo, carpeta, rama) {
    const url = `${git(repo)}/commits?searchCriteria.itemPath=${encodeURIComponent(carpeta)}` +
      `&searchCriteria.itemVersion.version=${encodeURIComponent(rama)}&searchCriteria.$top=1000&${API}`;
    const commits = ((await (await api(url)).json()).value) || [];
    return commits.filter((c) => c.author).map((c) => ({ nombre: c.author.name || null, email: c.author.email || null }));
  }

  // Las hojas del arbol de iteraciones: los sprints de verdad, no los nodos de año.
  async function listarIteraciones() {
    const url = `${org}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/iterations?$depth=10&${API}`;
    const raiz = await (await api(url)).json();
    const out = [];
    (function recorrer(nodo) {
      const hijos = nodo.children || [];
      if (!hijos.length) {
        if (nodo.name) out.push({
          nombre: nodo.name,
          ruta: nodo.path,
          inicio: (nodo.attributes && nodo.attributes.startDate) || null,
          fin: (nodo.attributes && nodo.attributes.finishDate) || null,
        });
      } else for (const h of hijos) recorrer(h);
    })(raiz);
    return out;
  }

  async function listarEstados(tipo) {
    const url = `${org}/${encodeURIComponent(project)}/_apis/wit/workitemtypes/${encodeURIComponent(tipo)}/states?${API}`;
    return (((await (await api(url)).json()).value) || []).map((s) => s.name);
  }

  return {
    wiql, getWorkItems, descargarAdjunto, quienSubioCadaAdjunto, setEstado, setCampos, listarEstados,
    listarArchivos, descargarArchivo, ultimoCommitDe, autoresDe, listarIteraciones,
  };
}
