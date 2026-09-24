// Una persona llega con un nombre distinto por cada fuente: Azure dice "Juan Ignacio Denipoti",
// su git local firma "Juani Denipoti", y la pantalla la mostraba como dos personas con la
// mitad de los pendientes cada una. El mail es lo unico estable, asi que la identidad sale de
// el, y el nombre que se muestra es el de Azure, que es el que el equipo reconoce.
//
// Una cuenta compartida (camp@) firma con el nombre de quien la uso ese dia. Ese mail no
// identifica a nadie: solo vale el nombre, y solo si ese nombre ya firmo con un mail propio.
// Lo que no se puede atribuir queda en null — un responsable inventado manda la tarea a
// quien no es y nadie se entera.

const clave = (s) => String(s == null ? '' : s).trim().toLowerCase();

function masFrecuente(conteo) {
  let mejor = null;
  let max = 0;
  for (const [nombre, n] of conteo) if (n > max) { mejor = nombre; max = n; }
  return mejor;
}

export function crearIdentidades({ ado = [], git = [] } = {}) {
  const firmas = new Map();
  for (const a of git) {
    if (!a || !a.email || !a.nombre) continue;
    const e = clave(a.email);
    if (!firmas.has(e)) firmas.set(e, new Map());
    const nombre = a.nombre.trim();
    firmas.get(e).set(nombre, (firmas.get(e).get(nombre) || 0) + 1);
  }

  // Tener dos nombres no hace compartido a un mail: Juani firma de las dos maneras con el suyo.
  // Lo hace compartido firmar con nombres que son de DOS o mas personas con mail propio.
  const mailsDelNombre = new Map();
  for (const [e, conteo] of firmas) {
    for (const nombre of conteo.keys()) {
      const n = clave(nombre);
      if (!mailsDelNombre.has(n)) mailsDelNombre.set(n, new Set());
      mailsDelNombre.get(n).add(e);
    }
  }
  const compartidos = new Set();
  for (const [e, conteo] of firmas) {
    const otros = new Set();
    for (const nombre of conteo.keys()) for (const o of mailsDelNombre.get(clave(nombre))) if (o !== e) otros.add(o);
    if (otros.size > 1) compartidos.add(e);
  }

  // Si la cuenta compartida tambien entra a Azure, Azure la muestra con un nombre propio
  // ("Trizap Camp") que parece una persona y no lo es: ese nombre tampoco identifica a nadie.
  const deAzure = new Map();
  const nombresCompartidos = new Set();
  for (const p of ado) {
    if (!p || !p.email || !p.nombre) continue;
    if (compartidos.has(clave(p.email))) nombresCompartidos.add(clave(p.nombre));
    else deAzure.set(clave(p.email), p.nombre.trim());
  }
  for (const e of compartidos) for (const nombre of firmas.get(e).keys()) nombresCompartidos.add(clave(nombre));

  const delMail = (e) => deAzure.get(e) || (compartidos.has(e) ? null : masFrecuente(firmas.get(e) || new Map()));

  const porNombre = new Map();
  for (const nombre of deAzure.values()) porNombre.set(clave(nombre), nombre);
  for (const [e, conteo] of firmas) {
    if (compartidos.has(e)) continue;
    const canonico = delMail(e);
    for (const nombre of conteo.keys()) if (canonico && !porNombre.has(clave(nombre))) porNombre.set(clave(nombre), canonico);
  }

  function nombreDe(persona) {
    if (!persona) return null;
    const e = clave(persona.email);
    const n = clave(persona.nombre);
    if (e && deAzure.has(e)) return deAzure.get(e);
    if (n && porNombre.has(n)) return porNombre.get(n);
    if (e && compartidos.has(e)) return null;
    if (n && nombresCompartidos.has(n)) return null;
    if (e && firmas.has(e)) return delMail(e);
    if (n) return persona.nombre.trim();
    return e ? persona.email.trim() : null;
  }

  return { nombreDe };
}

// Se aplica UNA vez, entre medir y armar el reporte: las reglas y la vista siguen leyendo
// `asignadoA` y `responsables.*.nombre` como siempre, pero ya con un solo nombre por persona.
// Los roles del .env aceptan un mail, que se resuelve al nombre de Azure.
export function unificarPersonas({ wis = [], scripts = [], roles = {}, autores = [] }) {
  const ado = [];
  for (const w of wis) if (w.asignadoA && w.asignadoAEmail) ado.push({ nombre: w.asignadoA, email: w.asignadoAEmail });
  const git = [...autores];
  for (const s of scripts) {
    const r = s.responsables || {};
    if (r.subioElAdjunto && r.subioElAdjunto.email) ado.push(r.subioElAdjunto);
    if (r.commiteoEnElRepo && r.commiteoEnElRepo.email) git.push(r.commiteoEnElRepo);
  }
  const { nombreDe } = crearIdentidades({ ado, git });

  for (const w of wis) {
    if (w.asignadoA) w.asignadoA = nombreDe({ nombre: w.asignadoA, email: w.asignadoAEmail });
  }
  for (const s of scripts) {
    const r = s.responsables;
    if (!r) continue;
    for (const k of Object.keys(r)) {
      if (r[k] && (r[k].nombre || r[k].email)) r[k] = { ...r[k], nombre: nombreDe(r[k]) };
    }
  }
  const rol = (v) => (v ? nombreDe(String(v).includes('@') ? { email: v } : { nombre: v }) : null);
  return { ...roles, promocion: rol(roles.promocion), produccion: rol(roles.produccion) };
}
