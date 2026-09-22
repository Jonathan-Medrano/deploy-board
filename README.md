# deploy-board

Dice, antes de subir scripts al FileZilla, **qué falta y quién lo tiene que hacer**.

Lee los `.sql` de un sprint desde dos lados —los adjuntos de Azure DevOps y la carpeta
`DB_Migrations` del repo—, mide contra cada base si ya corrieron, y reporta los desvíos con
nombre propio.

## Qué hace

- Descubre los `.sql` de **todos** los work items del sprint, no solo de la tarjeta `Scripts`.
- Vincula cada script a su work item por el `[U-xxxxx]` del **nombre del archivo**.
- Mide con sondas `SELECT` si cada script ya corrió en `dev`, `stage` y `sandbox`.
- Detecta once clases de desvío (D1–D11) y le pone un responsable a cada una.
- Ordena la lista **en orden de ejecución**: los `PRE` primero.

## Qué NO hace

- **No ejecuta scripts.** Reporta; el que corre un script es una persona.
- **No toca producción.** `produccion` no está en los catálogos conectables y `medirAmbiente`
  la rechaza antes de abrir nada.
- **No escribe en ninguna base.** Solo `SELECT` sobre catálogo del sistema y filas testigo.
- No valida reportes `.rdl`.

## Instalación (para el resto del equipo)

Hace falta **Git** y **Node**. Nada más: el sistema no tiene dependencias, así que no hay
`npm install` que pueda fallar justo el día del deploy.

1. Bajá `instalar.bat` y ponelo en la carpeta donde quieras que viva el sistema.
2. Doble click. Clona el repo en una subcarpeta `deploy-board` y deja un acceso directo
   **deploy-board** en el Escritorio.
3. Copiá `.env.example` a `.env` y completá `AZURE_PAT` y las credenciales de base.
4. Abrí **deploy-board** desde el Escritorio.

### Cómo se actualiza

De dos formas, y ninguna pide tocar una consola:

- **Al arrancar.** `iniciar.bat` hace `git pull --ff-only` antes de levantar nada. Si no hay
  red, no hay remoto, o esa copia tiene cambios locales, **arranca igual** y avisa: el sistema
  mide scripts, no depende de estar al día.
- **Con el botón "Actualizar sistema"**, desde la pantalla. Si baja código nuevo, el servidor
  se apaga solo y el `.bat` lo vuelve a levantar ya actualizado; la pantalla espera y se
  recarga sola.

`--ff-only` a propósito: si alguien tocó el código en su máquina, el pull **falla** en vez de
mezclar. Un merge automático en la máquina de otro es la clase de sorpresa que nadie puede
depurar el día del deploy.
### Cómo se publica una versión nueva (esto lo hace quien mantiene el sistema)

El código vive dentro del workspace `IA-JONA`, en `deploy-board/`. El repo que clonan los
devs es una proyección de esa carpeta, no una copia aparte que haya que mantener a mano:

```bash
cd "<workspace IA-JONA>"
git subtree push --prefix=deploy-board https://github.com/Jonathan-Medrano/deploy-board.git main
```

Desde ahí, cada dev lo recibe al arrancar o apretando **Actualizar sistema**. No hay que
avisar ni mandar nada: el `.bat` sólo se manda una vez, la primera.
## Cómo se corre

Dos formas, el mismo motor: el **tablero** (lo que mira el que va a subir) y la **consola**
(lo mismo en texto, para un pipeline o para pegar en un chat).

### El tablero

```powershell
powershell -ExecutionPolicy Bypass -File scripts\abrir.ps1
```

Levanta el servidor en <http://localhost:4700> y abre el navegador. Vive en la máquina de cada
uno, como el task runner. Desde ahí:

- **Volver a medir** corre la barrida completa (ADO + las bases) y actualiza la pantalla. Tarda
  decenas de segundos. Si falla, **la medición anterior queda en pantalla**: es la única foto
  que tiene el que está por subir, y borrarla por un error de red es peor que mostrarla vieja.
- **Marcar como subido a main** y **no tener en cuenta** se guardan con nombre y fecha. El
  nombre sale de `git config user.name`.
- El servidor escucha **sólo en `127.0.0.1`**: la pantalla muestra el sprint entero y no tiene
  login, así que publicarla en la red de la oficina tiene que ser una decisión, no un default.

### La consola

```bash
cd deploy-board
npm run report -- --iteracion "Fidel\2026\2026 Septiembre 2" --sprint Sprint_2026_09_01 --ambientes dev,stage
```

Opciones: `--destino stage` (el ambiente al que se promueve; default `stage`) · `--json`.

## Las marcas de main: lo único que no se mide

`main` **no se sondea nunca**. Su estado no sale de una consulta: sale de que una persona
marque en el tablero que ya lo subió. Por eso la marca guarda quién y cuándo — un hecho
registrado sin autor no se puede discutir después.

Las marcas viven en `deploy-board/estado/`, y esa carpeta es **configurable a propósito**:

```
DEPLOY_BOARD_ESTADO=\\servidor\deploy-board\estado
```

Apuntada a una carpeta compartida, una marca de Ana la ve todo el equipo. Dejada en el
default, cada uno ve las suyas — que es justo el problema que este sistema existe para
resolver, así que **si el equipo lo va a usar en serio, esa variable hay que ponerla**.

## Credenciales

Tanto `npm start` (el tablero) como `npm run report` (la consola) cargan `../taskrunner/.env` y después `deploy-board/.env` (opcional, pisa al
primero). De ahí salen `AZURE_PAT`, `AZURE_ORG_URL` y `AZURE_PROJECT`.

Para SQL: si no hay `SQL_SERVER` / `SQL_USER` / `SQL_PASSWORD`, cae al `Web.config` de
`Api.Net`. **Las variables ganan a propósito** — el `Web.config` viaja igual a todos los
ambientes, así que su credencial no está acotada a `dev`. Lo correcto es un login de **solo
lectura** propio; el día que exista, son dos variables.

`RESPONSABLE_PROMOCION` y `RESPONSABLE_PRODUCCION` son **roles, no autores**: quien ejecuta
depende del ambiente, no de quién escribió el script. Sin configurar, el desvío sale **sin
nombre** — nunca con uno inventado.

⚠️ La password viaja como argumento de `sqlcmd`, así que es visible en la lista de procesos
del sistema mientras dura cada consulta. Es inherente a usar `sqlcmd`, no un descuido: no
aparece en ninguna salida ni log de la herramienta, pero conviene saberlo.

## Resultado de la corrida real (2026-09-22, sprint `2026 Septiembre 2`)

| | |
|---|---|
| Scripts descubiertos | 27 |
| Corrieron en **los dos** ambientes medidos | 4 |
| **Corrieron en UNO SOLO** | **11** |
| …de esos, en dirección **inversa** (stage sí, dev no) | 1 |
| No corrieron en ninguno | 12 |
| **Sin veredicto firme** | **0** |
| Bloqueantes | 16 |

Desvíos: `D2` 11 · `D3` 6 · `D5` 4 · `D6` 23 · `D7` 9 · `D8` 1 · `D9` 1 · `D11` 15.

**El hallazgo más fuerte: la tarjeta y el repo están disjuntos.** 4 scripts existen solo en el
repo y 23 solo como adjunto — **ninguno en los dos lados**. `Sprint_2026_09_02` no existe en
`DB_Migrations`, así que los 23 que se van a subir no tienen commit, ni historia, ni autor, ni
diff.

## Qué NO se verificó en esa corrida

- **`sandbox` y `produccion` no se midieron.** La corrida fue con `--ambientes dev,stage`.
- **La comparación contra el repo apuntó a `Sprint_2026_09_01`**, que es la carpeta del sprint
  *anterior*, porque la de septiembre 2 no existe. Los `D5`/`D6` son correctos como hecho —
  esos scripts no están commiteados en ningún lado— pero el conteo no es una comparación
  carpeta-contra-tarjeta del mismo sprint.
- **No se reprodujo el número del 2026-09-18** ("8 de 9 en un solo ambiente"). El alcance es
  distinto a propósito: aquella medición miró los 9 adjuntos de la tarjeta `Scripts`; ésta
  barre los 27 `.sql` de todos los work items del sprint. Los dos números son consistentes en
  lo que muestran —divergencia generalizada entre ambientes— pero **no son el mismo número y
  no se deben presentar como si lo fueran.**
- **`D1` no disparó** en esta corrida: ninguna task contenedora quedó atrás de su work item
  en este sprint. La regla está cubierta por tests, no por esta corrida.
- **`D10` no disparó**, porque requiere que un script exista en las dos fuentes y ninguno lo hace.
- La escalera avisó de un estado que no conoce (**`Paused`**) y no le inventó un rango: los WI
  en ese estado no disparan `D1` ni `D4`.

## Tests

```bash
cd deploy-board && npm test
```

223 tests. **No tocan red ni base**: el cliente de ADO, `git` y `sqlcmd` entran por inyección.

⚠️ `node --test` sin argumentos también toma `test-*.{js,cjs,mjs}` de cualquier lugar del
árbol. Un archivo suelto con ese nombre suma tests fantasma al conteo.

## Estructura

```
src/parser/        nombre de archivo, encoding (UTF-16LE de SSMS), objetos del cuerpo SQL
src/sondas/        derivar sondas, armar la consulta, veredicto por ambiente
src/ado/           cliente de Azure DevOps
src/fuentes/       descubrimiento: adjuntos de ADO y DB_Migrations del repo
src/reconciliador/ une las dos fuentes conservando el desacuerdo
src/desvios/       escalera de estados y las once reglas
src/db/            ejecutor de sondas por sqlcmd
src/reporte.js     modelo y formato del reporte
src/medir.js       la barrida completa, que usan la consola y el tablero
src/vista.js       proyección del reporte al modelo que consume la pantalla
src/marcas.js      las decisiones de una persona: subido a main, no tener en cuenta
src/almacen.js     dónde se guardan esas decisiones y la última medición
src/servidor.js    el tablero local (node:http, sin dependencias)
src/actualizador.js  git pull --ff-only, para el boton de actualizar
src/entorno.js     lector de .env propio (sin depender de la version de Node)
src/servidor-cli.js  arranque del tablero
src/cli.js         arranque de la consola
web/               la pantalla: HTML, CSS y JS de navegador, sin bundler
instalar.bat       clona el sistema y deja el acceso directo en el Escritorio
iniciar.bat        actualiza, levanta y reinicia solo cuando baja codigo nuevo
scripts/abrir.ps1  levanta el tablero y abre el navegador
```

`parser`, `sondas` (derivar/consulta/veredicto), `reconciliador`, `desvios`, `roles`, `vista`
y `marcas` son **puros**: se testean en memoria, sin red ni base. El servidor se testea por su
manejador, sin abrir un socket.

**Cero dependencias en tiempo de ejecución**, a propósito: un `npm install` que falla el día
del deploy es exactamente el momento en que esta herramienta tiene que andar.

## Dos trampas que ya costaron caro

1. **Los `.sql` de SSMS vienen en UTF-16LE.** Leídos como UTF-8 el parseo devuelve "sin
   objetos" **sin tirar error**.
2. **`sqlcmd` termina las líneas con CRLF.** Partir la salida por `'\n'` deja un `\r` colgando,
   y en una regex de JavaScript `\r` **es** un terminador de línea: ningún renglón matchea,
   todas las sondas vuelven vacías y cada script queda en `?`. Falla del lado seguro, y por eso
   pasó desapercibido con 144 tests en verde hasta la primera corrida real.

Y una de método: **`-h` y `-W` son incompatibles con `-y` en `sqlcmd`.** Con `-y 0` solo, la
salida de una definición ya viene limpia. Medido, no supuesto — el supuesto contrario rompió
todas las consultas de definición.
