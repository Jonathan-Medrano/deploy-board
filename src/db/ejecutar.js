import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { consultaDeSondas, consultaDefinicion } from '../sondas/consulta.js';
import { veredicto } from '../sondas/veredicto.js';

// produccion NO esta aca a proposito: fidel_db vive en otro server, con otra credencial,
// y este sistema no tiene forma de conectarse ni aunque se lo pidan.
export const CATALOGOS = { dev: 'dev_fidel_db', stage: 'stage_fidel_db', sandbox: 'sandbox_fidel_db' };

// Fallback al Web.config del Api.Net, que es de donde saca la conexion el script que este
// sistema reemplaza. Se LEE, nunca se imprime ni se transcribe. Las variables de entorno
// GANAN: el Web.config viaja igual a todos los ambientes, asi que su credencial no esta
// acotada a dev, y lo correcto es un login de solo lectura propio en cuanto exista.
export function credencialesDelWebConfig(ruta, deps = {}) {
  const leer = deps.leer || ((r) => (fs.existsSync(r) ? fs.readFileSync(r, 'utf8') : null));
  const xml = leer(ruta);
  if (!xml) return null;
  const m = xml.match(/connectionString="([^"]*Initial Catalog=[^"]*)"/i);
  if (!m) return null;
  const cs = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  const val = (re) => { const x = cs.match(re); return x ? x[1].trim() : null; };
  const cred = {
    server: val(/(?:Data Source|Server)\s*=\s*([^;]+)/i),
    user: val(/(?:User ID|Uid)\s*=\s*([^;]+)/i),
    pass: val(/(?:Password|Pwd)\s*=\s*([^;]+)/i),
  };
  return cred.server && cred.user && cred.pass ? cred : null;
}

export function credenciales(env = process.env, deps = {}) {
  const deLasVariables = { server: env.SQL_SERVER, user: env.SQL_USER, pass: env.SQL_PASSWORD };
  if (deLasVariables.server && deLasVariables.user && deLasVariables.pass) return deLasVariables;

  const ruta = env.WEB_CONFIG || path.join(env.API_NET_DIR || '../Api.Net', 'Api', 'WebApp', 'Web.config');
  const delConfig = (deps.leerWebConfig || credencialesDelWebConfig)(ruta, deps);
  if (delConfig) return delConfig;

  throw new Error(
    'Faltan SQL_SERVER / SQL_USER / SQL_PASSWORD en el entorno y tampoco pude leer la conexion ' +
    'del Web.config de Api.Net. Completa el .env o revisa API_NET_DIR.'
  );
}

// Separado y exportado para poder testear los flags SIN levantar un proceso.
//
// La rama de texto largo lleva `-y 0` SOLO. Medido contra dev el 2026-09-22, porque el
// supuesto contrario ya costo una correccion: sqlcmd rechaza `-h` junto con `-y`
// ("The -h and the -y 0 options are mutually exclusive") y tambien `-W` junto con `-y`. Y no
// hacen falta: con `-y 0` y `SET NOCOUNT ON` la salida arranca DIRECTO en el cuerpo del
// modulo — sin cabecera de columna, sin linea de guiones y sin banner de filas afectadas.
// Verificado sobre sp_getselectproducts: la linea 0 es "CREATE PROCEDURE [dbo].[...]".
export function argsDeSqlcmd(cred, catalogo, consulta, { textoLargo = false } = {}) {
  const base = ['-S', cred.server, '-U', cred.user, '-P', cred.pass, '-d', catalogo, '-l', '20', '-s', '', '-Q', consulta];
  return base.concat(textoLargo ? ['-y', '0'] : ['-h', '-1', '-W']);
}

function correrSqlcmd(cred, catalogo, consulta, opts = {}) {
  const args = argsDeSqlcmd(cred, catalogo, consulta, opts);
  try {
    return execFileSync('sqlcmd', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // La salida se recorta y NUNCA se incluyen los args: ahi viaja la password.
    const salida = [e.stdout, e.stderr].filter(Boolean).join('\n');
    throw new Error(`sqlcmd fallo contra ${catalogo}: ${salida.slice(0, 300)}`);
  }
}

// El split va por /\r?\n/ y NO por '\n'. sqlcmd en Windows termina las lineas con CRLF, asi
// que partir solo por \n deja un \r colgando al final de cada renglon — y en una regex de
// JavaScript `\r` ES un terminador de linea: `.` no lo matchea y `$` (sin flag m) tampoco
// cierra antes de el. Resultado: NINGUN renglon matchea, todas las sondas vuelven vacias y
// cada script queda en "?". Falla del lado seguro pero deja la medicion entera muerta, y los
// tests con '\n' literal no lo tocan. Medido el 2026-09-22 corriendo contra dev.
export function parsearSalida(texto) {
  const out = {};
  for (const linea of String(texto).split(/\r?\n/)) {
    const m = linea.match(/^(s\d+)(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export async function medirAmbiente(scripts, ambiente, deps = {}) {
  const catalogo = CATALOGOS[ambiente];
  if (!catalogo) throw new Error(`Ambiente "${ambiente}" no es consultable. Produccion no se sondea nunca.`);

  const correr = deps.correr || correrSqlcmd;
  const cred = deps.cred || credenciales(deps.env);
  const out = {};

  for (const s of scripts) {
    // `consultaDeSondas` TAMBIEN va adentro del try: puede tirar (sus validadores rechazan un
    // identificador o un literal que no encaja), y afuera ese throw rechazaba la promesa entera
    // y perdia la medicion de TODOS los demas scripts del lote. El contrato que consulta.js
    // documenta es "se rechaza, y medirAmbiente la convierte en ?" — con la llamada afuera del
    // try, el codigo no cumplia el contrato que su propia dependencia promete.
    try {
      const consulta = consultaDeSondas(s.sondas || []);
      if (!consulta) {
        out[s.id] = veredicto(s.sondas || [{ id: 's0', tipo: 'sin_sonda', detalle: 'sin sondas' }], {});
        continue;
      }
      const respuestas = parsearSalida(correr(cred, catalogo, consulta, {}));
      const definiciones = {};
      for (const sonda of s.sondas) {
        if (sonda.tipo !== 'modulo' || respuestas[sonda.id] !== 'SI') continue;
        const txt = String(correr(cred, catalogo, consultaDefinicion(sonda.objeto), { textoLargo: true }))
          .replace(/\n\(\d+ rows? affected\)\s*$/i, '').trim();
        definiciones[sonda.objeto] = txt && txt !== 'NULL' ? txt : null;
      }
      out[s.id] = veredicto(s.sondas, respuestas, definiciones);
    } catch (e) {
      // Un fallo de conexion NUNCA se traduce en "OK": queda en ? con el motivo.
      out[s.id] = { estado: '?', nota: e.message };
    }
  }
  return out;
}
