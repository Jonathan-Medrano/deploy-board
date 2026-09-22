import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { leerSql } from '../parser/leerSql.js';
import { armarScriptParcial } from './comun.js';
import { parsearNombre } from '../parser/nombre.js';

// Quien commiteo el .sql. Es el responsable a nombrar cuando el script esta en el repo y
// no esta adjunto en la tarjeta (D5): es el que tiene que subirlo. Un fallo de git no es
// un error del barrido — devuelve null y el desvio sale sin nombre.
export function autorEnGit(rutaArchivo, deps = {}) {
  const correr = deps.correr || ((args, cwd) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  try {
    const salida = correr(
      ['log', '-1', '--format=%an%x09%ad', '--date=short', '--', path.basename(rutaArchivo)],
      path.dirname(rutaArchivo)
    ).trim();
    if (!salida) return null;
    const [nombre, fecha] = salida.split('\t');
    return nombre ? { nombre, fecha: fecha || null } : null;
  } catch {
    return null;
  }
}

export function descubrirRepo(dirDbMigrations, carpetaSprint, deps = {}) {
  const raiz = path.join(dirDbMigrations, carpetaSprint);
  if (!fs.existsSync(raiz)) return [];

  const leer = deps.leerSql || leerSql;
  const out = [];
  for (const carpeta of fs.readdirSync(raiz, { withFileTypes: true })) {
    if (!carpeta.isDirectory()) continue;
    const dir = path.join(raiz, carpeta.name);
    for (const f of fs.readdirSync(dir)) {
      // Solo la convencion. Los __OLD/__NEW quedan afuera solos: no empiezan con '['.
      if (!/^\[/.test(f) || !/\.sql$/i.test(f)) continue;
      const ruta = path.join(dir, f);
      try {
        out.push(armarScriptParcial(f, leer(ruta), 'repo', {
          carpeta: carpeta.name,
          responsables: { commiteoEnElRepo: autorEnGit(ruta, deps) },
        }));
      } catch (e) {
        // Un archivo ilegible es UN script sin veredicto, no un barrido caido. Y el NOMBRE
        // sigue siendo legible: parsearNombre es puro y no depende del contenido, asi que
        // nulear wiId/esPre/accion aca fabricaba un D7 y un D11 falsos sobre un archivo bien
        // nombrado, y ademas apagaba el D3 de un PRE que si falta. Solo se pierde lo que el
        // contenido ilegible realmente niega: los objetos y el SQL.
        const datos = parsearNombre(f);
        out.push({
          ...datos,
          id: `ilegible/${carpeta.name}/${f}`,
          objetos: [], sql: '', fuente: 'repo', carpeta: carpeta.name, responsables: {},
          sondas: [{ id: 's0', tipo: 'sin_sonda', detalle: `no pude leer ${f}: ${e.message}` }],
        });
      }
    }
  }
  return out;
}
