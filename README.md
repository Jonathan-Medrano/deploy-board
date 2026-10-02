# deploy-board

Dice, antes de subir scripts al FileZilla, **qué falta y quién lo tiene que hacer**.

Lee los `.sql` de un sprint desde dos lados —los adjuntos de Azure DevOps y la carpeta
`DB_Migrations` del repo—, mide contra cada base si ya corrieron, y reporta los desvíos con
nombre propio.

## Qué hace

- Descubre los `.sql` de **todos** los work items del sprint, no solo de la tarjeta `Scripts`.
- Vincula cada script a su work item por el `[U-xxxxx]` del **nombre del archivo**.
- Mide con sondas `SELECT` si cada script ya corrió en `dev`, `stage` y `sandbox`.
- Detecta trece clases de desvío (D1–D13) y le pone un responsable a cada una. `D12` es el
  mismo script con **contenido distinto** en dos lugares (dos adjuntos, o adjunto y repo): no se
  elige uno en silencio, se muestran las dos versiones y lo unifica el dueño. `D13` (alto) es
  un script de un work item **pausado** que igual ya corrió en algún ambiente medido: lo revisa
  el dueño del work item.
- Un script de un work item **cerrado** (`Closed`/`Done`) o **pausado** (`Paused`) no es parte
  de la subida: no dispara los desvíos de ejecución (`D2`, `D3`, `D4`) — pedir que se corra
  sería una orden falsa — y la pantalla lo aparta (ver "Cerrados y en pausa").
- Si un script nombra un work item que **no está en la iteración** (un `[B-25038]` adjunto a
  una task del sprint, con el bug en otro sprint), ese work item se trae aparte en una sola
  llamada y la fila lo marca **"fuera del sprint"**. Si esa llamada falla, hay un aviso y esas
  filas quedan sin estado.
- Ordena la lista **en orden de ejecución**: los `PRE` primero.
- El `PRE` se reconoce en dos posiciones del nombre: antes del `NN` (`PRE - 01 - ...`) o
  justo después (`01 - PRE - ...`) — el equipo escribe las dos.
- **Control contra el PR stage → main.** Con el link del PR de `Api.Net` pegado, "Medir con PR"
  mide el sprint y después compara los `.sql` de `DB_Migrations` que trae el PR (de cualquier
  carpeta de sprint) contra lo medido: lo que el PR trae y el panel no vio (por ejemplo, un
  script commiteado en la carpeta de un sprint anterior), lo que el panel tiene y el PR no
  trae, y el mismo script con otro contenido. Cada hallazgo dice dónde está, por qué y quién
  responde. No mide ninguna base: compara listas. Si el PR falla, la medición se guarda igual.
- **Pestaña Repos: pases de rama de todo el proyecto.** Elegís el pase (dev → stage,
  stage → main o stage → dev) y "Medir" lista los repos de `Fidel` que tienen las tres ramas
  (dev/develop, stage/master, main) con cuántos commits faltan pasar, el último, y si ya hay un
  PR activo. "Crear PR" crea el `DevToStage` / `StageToMain` / `StageToDev` de ese repo y lo
  abre; antes vuelve a medir ese repo, así que no duplica un PR ni abre uno vacío. Los
  conflictos los resuelve el dev en Azure. Es la **única** acción del sistema que escribe en
  Azure, y vive aparte (`src/ado/prs.js`).

## Qué NO hace

- **No ejecuta scripts.** Reporta; el que corre un script es una persona.
- **No toca producción.** `produccion` no está en los catálogos conectables y `medirAmbiente`
  la rechaza antes de abrir nada.
- **No escribe en ninguna base.** Solo `SELECT` sobre catálogo del sistema y filas testigo.
- **No necesita ningún otro repositorio clonado.** Los `.sql` del sprint los lee de Azure, de
  los dos lados: los adjuntos de los work items y la carpeta `Api/DB_Migrations` del `Api.Net`.
- No valida reportes `.rdl`.
- **`__OLD` y `__NEW`, la convención del equipo para un SP que cambia.** `X__OLD.sql` es el
  respaldo del cuerpo que **ya** está en stage/main: nunca se ejecuta, así que se descarta de
  los dos lados. `X__NEW.sql` es el cuerpo **nuevo**, o sea la copia commiteada del script que
  se adjunta con la convención (`[B-25017] - ... - ALTER.sql`):
  - **En el repo**, el `__NEW` entra y se une con el adjunto del **mismo work item** que tenga
    el mismo contenido o que defina el módulo `X` (procedure, function, view o trigger). Queda
    una sola fila, la del adjunto (es lo que se sube), con las dos fuentes: ni `D6` por el
    adjunto ni `D5` por el `__NEW`. Si el cuerpo commiteado difiere del adjunto, `D12` lo dice.
    Con cero o varios adjuntos candidatos no se elige: el `__NEW` queda solo y sale `D5` (no
    `D7` ni `D11`: su nombre es la convención). La unión corre **al final**: un adjunto que ya
    tiene pareja exacta en el repo es de esa pareja, no del `__NEW`.
  - **En la tarjeta**, un `__OLD` o `__NEW` adjunto se sigue descartando (el que se sube es el
    que respeta la convención de nombre) y sale como aviso.

## Instalación (para el resto del equipo)

El sistema vive en **FidelWorkSpace**, en `Tools/Paneles/deploy-board`, y se abre con
`Tools/Paneles/Abrir deploy-board.bat`. Hace falta **Git** y **Node**. Nada más: el sistema no
tiene dependencias, así que no hay `npm install` que pueda fallar justo el día del deploy.

1. Tené un clon de FidelWorkSpace (cualquier rama sirve, ver "Cómo se actualiza").
2. En `Tools/Paneles/deploy-board`, copiá `.env.example` a `.env` y completá `AZURE_PAT` y las
   credenciales de base. `.env` y `estado/` no están en git: son de cada máquina.
3. Abrí `Tools/Paneles/Abrir deploy-board.bat`.

### Cómo se actualiza

Solo, cada vez que se abre, y ninguna forma pide tocar una consola:

- **Al arrancar.** `scripts\arrancar.bat` (que `iniciar.bat` lanza) corre
  `src/actualizar-cli.js`: trae `origin/main` y deja **solo la carpeta del sistema** igual a la
  de `main`. No hace `pull` del repo: quien abre el panel puede estar en cualquier rama, con
  cualquier trabajo propio en otras carpetas de FidelWorkSpace, y eso no se toca. Si no hay red,
  o `main` todavía no tiene el sistema, **arranca igual** y avisa: el sistema mide scripts, no
  depende de estar al día.
- **Con el botón "Actualizar sistema"**, desde la pantalla. Si baja código nuevo, el servidor
  se apaga solo y el `.bat` lo vuelve a levantar ya actualizado; la pantalla espera y se
  recarga sola.

La actualización **pisa** la carpeta con la de `main` (`git restore --source=origin/main
--worktree`). Un cambio local a mano en el sistema se pierde al abrirlo: el sistema se cambia en
su copia de desarrollo y se publica. Como no toca el índice, en una rama atrasada `git status`
muestra los archivos del sistema como modificados: es esperado.

`iniciar.bat` **no se modifica nunca**: cmd lo lee por posición mientras corre, y una
actualización que lo cambie a mitad de camino lo hace seguir desde un renglón que ya no existe.
Todo lo que puede cambiar vive en `scripts\arrancar.bat`, que se ejecuta desde una copia en
`%TEMP%`. Hay un test que falla si `iniciar.bat` vuelve a actualizar él mismo.

### Cómo se publica una versión nueva (esto lo hace quien mantiene el sistema)

El código se desarrolla dentro del workspace `IA-JONA`, en `deploy-board/`. Para publicar:

```bash
node deploy-board/scripts/publicar.mjs
```

Copia los archivos (sin `.git`, `node_modules`, `estado` ni `.env`) al clon local de
FidelWorkSpace, en `Tools/Paneles/deploy-board`. Por defecto lo busca en
`~/Desktop/FidelWorkSpace`; otra ubicación va en la variable de entorno `DEPLOY_BOARD_PUBLICAR_EN`. Después: commit en una
rama de FidelWorkSpace y PR a `main`. Cuando se mergea, cada uno lo recibe al abrir el panel.

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
npm run report -- --iteracion "Fidel\2026\2026 Septiembre 2" --sprint Sprint_2026_09_02 --ambientes dev,stage
```

Opciones: `--destino stage` (el ambiente al que se promueve; default `stage`) · `--json`.

## Mientras mide, el tablero no contesta

Las consultas a las bases salen por `sqlcmd` de forma **síncrona**, así que durante una
medición el proceso entero queda bloqueado: no responde `/api/ping`, ni sirve la página, ni
atiende a otra pestaña. Dura lo que dure la medición — del orden de minutos.

No es un cuelgue: cuando termina, contesta todo lo que quedó encolado. Pero si abrís el
tablero en otra ventana mientras mide, va a parecer caído. Está así a propósito por ahora:
es una herramienta local de una persona, y una medición asíncrona agrega concurrencia real
a cambio de poco.
## "Ya en rama MAIN": ahora se detecta solo

Regla del equipo: **si el `.sql` llegó a la rama `main` de `Api.Net`, corrió en producción.** No
hay base de producción que consultar, así que `medirTodo` lee la carpeta del sprint una segunda
vez, en `main` (además de la lectura habitual en `DEPLOY_BOARD_RAMA_SCRIPTS`), y compara.

Por fila:

- **Badge verde "Ya en rama MAIN"** — automático. Hay un archivo en `main` con el **mismo
  contenido** (mismo hash), sin importar si el nombre cambió al commitearlo. Cuenta como hecho,
  igual que la marca manual de siempre.
- **Badge naranja "En MAIN, pero otra versión"** — hay un archivo con el **mismo nombre**
  normalizado en `main`, pero con otro contenido. **No** cuenta como hecho: lo que vas a subir
  todavía no es lo que hay en `main`.
- Ninguno de los dos — no se encontró nada en `main` con ese nombre ni ese contenido.

En `main` el script de un SP suele estar commiteado como `X__NEW.sql`: ese archivo cuenta como
el nombre del script que define el módulo `X` (sin mayúsculas). Con el mismo contenido es
**"Ya en rama MAIN"**; con otro, **"En MAIN, pero otra versión"**. Los `__OLD` de `main` nunca
cuentan.

El contenido manda sobre el nombre a propósito: son la única señal que no depende de que nadie
haya escrito el `.sql` con la convención exacta. Si **dos scripts del sprint tienen el mismo
contenido** (mismo hash), el hash solo ya no alcanza para saber cuál de los dos llegó a main:
ahí hace falta que el nombre coincida también, y si no coincide con ninguno el badge queda sin
evaluar (ninguno de los dos se marca) en vez de atribuirle a uno el commit del otro. Los scripts que sólo están **adjuntos** a la
tarjeta y nunca se commitearon (ver "El hallazgo más fuerte" más arriba) **nunca** van a tener
badge — no hay nada que buscar en `main` — así que para ellos el check manual sigue siendo la
única forma de marcarlos.

`DEPLOY_BOARD_RAMA_MAIN` (default `main`) es la rama que se lee. **`Api.Net` también tiene una
rama `master`**, pero esa **no** es el destino de promoción: los PR de `StageToMain` van a
`main`, no a `master`. No cambies esta variable a `master` salvo que el equipo cambie esa
convención.

Si la carpeta del sprint no está elegida, `main` no se evalúa (igual que el repo de la rama
`dev`): el badge no aparece en ninguna fila. Si la lectura de `main` falla, el sistema avisa
("No pude leer la rama main de ... : 'Ya en rama MAIN' no se evaluó") y el resto de la medición
sigue igual.

El check manual sigue existiendo — ahora etiquetado **"Corrió en main"**— y se puede tildar
igual aunque la fila ya tenga el badge verde: sirve para las tarjetas de otros ambientes o
casos donde alguien quiere dejarlo asentado a mano.

## Cerrados y en pausa: fuera de la subida

Un script cuyo work item está **cerrado** (`Closed` o `Done`) se asume ya en main; uno cuyo work
item está **en pausa** (`Paused`) no se ejecuta. Ninguno de los dos cuenta como bloqueante,
pendiente, "va en esta subida" ni "queda afuera": bajan a dos grupos plegados al final de la
tabla.

- **"Cerrados: se asumen en main"**. Cada fila dice si eso se pudo confirmar: *Confirmado en
  main* (badge verde o marca manual); *Cerrado; no se puede confirmar en main: nunca se
  commiteó* (no hay copia en el repo contra la cual comparar); o, en naranja, *Cerrado pero no
  se encontró en main*.
- **"En pausa: no se ejecutan"**. Si el script igual corrió en algún ambiente, la fila lo dice
  en naranja (*Pausado pero corrió en dev*) y sale `D13`.

`D1` sobre un work item cerrado o pausado baja a `medio` (prolijidad, no bloquea), y un work item
traído de fuera del sprint no participa de `D1` ni de `D8`. **Límite conocido:** el panel de
pendientes por persona todavía lista los pendientes de las filas cerradas o pausadas.

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

### Decisiones: marcar, ignorar y aceptar

Todo lo que una persona decide vive en `decisiones.json`, **separado por sprint**:

| Decisión | Se ata a | Motivo |
|---|---|---|
| **Corrió en main** (el check) | el hash del script | no |
| **No tener en cuenta** (✕) | el hash del script | obligatorio |
| **Aceptar como está** (un desvío) | la firma del desvío | obligatorio |

- **Si el script cambia, la marca o el ignorado vencen solos.** La fila lo dice ("marcado sobre
  otra versión") y el script vuelve a contar. Una marca vieja no puede tapar un SQL que nadie
  miró. El hash lo pone el servidor desde la medición guardada, no la pantalla.
- **La firma de un desvío es el hecho** (código, script, work item, task, título y detalle), no
  quién es responsable ni la severidad. Si el hecho cambia, la aceptación no lo cubre.
- **Aceptar no borra.** Lo aceptado queda tachado en "Aceptados", con autor, fecha y motivo, y
  se puede reabrir. Deja de contar como bloqueante y sale de "Qué le falta a cada uno".
- **Resuelto no es un botón.** Es el desvío que estaba en la medición anterior del mismo sprint
  y en la nueva ya no está: aparece en "Resueltos desde la medición anterior".
- Los desvíos de un script marcado o ignorado no figuran como pendientes de nadie.
- Todo esto lo calcula `aplicarDecisiones` (`src/decisiones.js`) en el servidor. La pantalla
  pinta lo que recibe, y la consola (`node src/cli.js report`) aplica lo mismo: los dos dan el
  mismo veredicto, y la consola lista al final las decisiones que aplicó y las que vencieron.

### Qué dice la ventana del sistema

Mientras mide, la consola avisa con color en qué etapa va (Azure, repo, main, cada base) y al
terminar cuánto tardó: en verde si está listo para subir, en amarillo si quedan bloqueantes, en
rojo si falló. También anuncia cada decisión que alguien guarda desde la pantalla. Va por
stderr, así `--json` sigue saliendo limpio; `NO_COLOR=1` apaga los colores.

⚠️ **El `marcas.json` de versiones anteriores no se migra.** Sus ids cambiaron y no guardaba
qué versión del script se marcó: aplicarlo sería inventar. Queda intacto en la carpeta, la
pantalla avisa una vez, y lo ya subido hay que volver a marcarlo.

### Qué pasa cuando dos guardan a la vez, o el archivo se rompe

- **Cada guardado reemplaza el archivo de una vez** (escribe un temporal y lo renombra). Un
  corte a la mitad deja el `decisiones.json` anterior entero, no un JSON truncado.
- **`decisiones.json` lleva `version`.** La pantalla manda la versión que leyó; si otro guardó
  en el medio, el servidor contesta 409 con lo que hay ahora y la pantalla reintenta tu cambio
  encima **una** vez. No hay locks: en una carpeta de red no son confiables, así que dos
  guardados en el mismo instante todavía pueden pisarse. El caso que sí cubre es el real:
  decidir con la pantalla abierta desde hace un rato.
- **Un `decisiones.json` ilegible no se lee como vacío.** La tabla se ve sin decisiones, con un
  aviso, y **no se guarda nada** hasta que alguien lo revise a mano.
- **La medición se guarda por sprint** (`vista-<sprint>.json`). Con la carpeta compartida,
  medir un sprint ya no pisa la foto de otro. Al abrir, la pantalla muestra la medición más
  reciente de cualquier sprint; un `vista.json` de versiones anteriores se sigue leyendo si
  no hay otra (pero no se puede marcar sobre ella: no trae hashes; hay que medir de nuevo).

## Credenciales

Todo va en `deploy-board/.env`, que el instalador te deja copiado de `.env.example`. Son cinco
valores que hay que pedirle al equipo: `AZURE_PAT`, y `SQL_SERVER` / `SQL_USER` / `SQL_PASSWORD`
de las bases de dev y stage.

**No están en el repo a propósito** y no hay que commitearlas nunca: `.env` está en el
`.gitignore`. Lo correcto a futuro es un login de **solo lectura** propio para estas consultas.

Lo que esté puesto en el entorno de la terminal gana sobre el archivo, así se puede medir otro
sprint sin editar nada — que es como se termina dejando una configuración de prueba puesta.

Quien ejecuta depende del ambiente, no de quién escribió el script. Lo que falta en el destino
de una promoción va al rol **"Encargado de ejecutar scripts"**, fijo. `RESPONSABLE_PRODUCCION`
sigue siendo configurable: sin configurar, el desvío sale **sin nombre** — nunca con uno inventado.

⚠️ La password viaja como argumento de `sqlcmd`, así que es visible en la lista de procesos
del sistema mientras dura cada consulta. Es inherente a usar `sqlcmd`, no un descuido: no
aparece en ninguna salida ni log de la herramienta, pero conviene saberlo.

## El sprint se elige en la pantalla

Arriba de la tabla hay dos selectores: la **iteración** de Azure (el sprint) y la **carpeta**
del repo contra la que se compara. Al elegir un sprint, su carpeta se selecciona sola — el
nombre se deriva (`2026 Septiembre 2` → `Sprint_2026_09_02`), y la lista muestra sólo las que
**existen de verdad** en el repo.

Al abrir, viene elegido el sprint **en curso**: el que contiene la fecha de hoy. No el último
creado — en Azure hay 208 iteraciones y las de los próximos meses ya están creadas.

Si la carpeta derivada no existe en el repo, la pantalla lo dice. Sin ella no se pueden
detectar los desvíos de *script faltante o sobrante*, y una lista sin esos desvíos se lee como
«todo coincide» cuando en realidad no se comparó nada.

## Resultado de la corrida real (2026-09-22, sprint `2026 Septiembre 2`)

| | |
|---|---|
| Scripts descubiertos | 23 |
| …de esos, presentes en **la tarjeta y el repo** | 4 |
| …presentes **sólo como adjunto** | 19 |
| Corrieron en **los dos** ambientes medidos | 3 |
| **Corrieron en UNO SOLO** | **11** |
| …de esos, en dirección **inversa** (stage sí, dev no) | 1 |
| No corrieron en ninguno | 9 |
| **Sin veredicto firme** | **0** |
| Bloqueantes | 14 |

Desvíos: `D2` 11 · `D3` 4 · `D6` 19 · `D7` 9 · `D8` 1 · `D9` 3 · `D11` 15.

**El hallazgo más fuerte: la mayoría de los scripts del sprint no están commiteados.** 19 de 23
existen sólo como adjunto en la tarjeta: no tienen commit, ni historia, ni autor, ni diff.

> ⚠️ **Corrección (2026-09-22, misma fecha).** La primera versión de esta sección decía que la
> tarjeta y el repo estaban **completamente disjuntos** y que `Sprint_2026_09_02` no existía en
> `DB_Migrations`. Las dos cosas eran falsas, y por la misma causa: la comparación leía una
> **copia local desactualizada** del `Api.Net`. Leyendo de Azure, la carpeta existe y **4
> scripts sí están en los dos lados**. El sistema ahora lee del origen, que no se desactualiza.

## Qué NO se verificó en esa corrida

- **`sandbox` y `produccion` no se midieron.** La corrida fue con `--ambientes dev,stage`.
- **La corrida nueva no se miró en pantalla.** Los números salen del reporte por consola.
- **No se reprodujo el número del 2026-09-18** ("8 de 9 en un solo ambiente"). El alcance es
  distinto a propósito: aquella medición miró los 9 adjuntos de la tarjeta `Scripts`; ésta
  barre los 27 `.sql` de todos los work items del sprint. Los dos números son consistentes en
  lo que muestran —divergencia generalizada entre ambientes— pero **no son el mismo número y
  no se deben presentar como si lo fueran.**
- **`D1` no disparó** en esta corrida: ninguna task contenedora quedó atrás de su work item
  en este sprint. La regla está cubierta por tests, no por esta corrida.
- **`D5` y `D10` no dispararon.** No hay ningún script que esté en el repo y no en la tarjeta,
  y ninguno de los 4 que están en los dos lados quedó numerado distinto.
- La escalera avisó de un estado que no conoce (**`Paused`**) y no le inventó un rango: los WI
  en ese estado no disparan `D1` ni `D4`.
- **Los números de esta sección están medidos con la lógica vieja.** Desde el 2026-09-22 la
  sonda de un módulo (SP, función, vista) calcula su hash esperado sobre **el lote del módulo**
  (`loteDelModulo`, en `derivarSondas`) en vez de sobre el archivo entero. Eso cambia los
  **veredictos de SP por ambiente** (`OK` / `FALTA`) respecto de la corrida del 2026-09-22.
  **No** cambia `contenidoDistinto` ni `D12`: esos usan `hashContenido`, que sigue siendo sobre
  el archivo completo. No se volvió a correr la barrida completa para recalcular esta tabla:
  los conteos de arriba son un dato histórico, no el estado actual del sistema.

## Límites conocidos de la reconciliación

Cuando dos archivos distintos de un mismo work item comparten descripción y acción
(`01 - Pedidos - ALTER` y `02 - Pedidos - ALTER`), se separan por su `NN` dentro de cada
fuente antes de cruzar tarjeta contra repo. El resultado **no depende del orden** en que Azure
lista los archivos (medido con todas las permutaciones) y **nunca junta dos contenidos
distintos en un mismo registro**. A cambio, en estos casos el mismo archivo puede quedar
partido en dos registros, con un `D5`/`D6` de más:

- una copia renumerada en otra tarjeta (`01` en una, `07` en otra, mismo contenido) cuando el
  work item además tiene otro script con la misma descripción;
- el mismo `NN` escrito distinto (`[U-5]- 01` contra `[U-5] - 01`);
- un script marcado `PRE` de un lado y no del otro: el resultado cambia según haya o no
  colisión del otro lado, y ningún desvío reporta la diferencia de `PRE`.

Un archivo sin `[U-xxxxx]` adjunto a la User Story **y** a su task de scripts es una sola fila,
colgada del único contenedor que no es Task (la otra copia queda en `aliases`, y `D12` avisa si
el contenido difiere); con cero o dos o más contenedores que no son Task quedan separadas. La
task se une solo a la US que nombra en el título (`US-24768_…`, `U-24768`, `US24768`) o de la
que cuelga; un título que nombra dos US no alcanza. La unión confía en ese título o padre: una
task titulada con la US equivocada le atribuye sus scripts a esa US, y `D12`/`D5` son la única
señal. Un adjunto ilegible (`ilegible/…`) nunca se une: si una de las dos copias no se pudo
leer, quedan dos filas.

El emparejamiento por contenedor entre la tarjeta y el repo (un único candidato por nombre de
cada lado) no mira el tipo del contenedor: una copia que cuelga de una task se empareja igual
con la carpeta de cualquier US.

Falla del lado del ruido, no del silencio: sobra un aviso, no falta un script. Unir por
contenido para evitarlo se probó y se revirtió, porque la unión es transitiva y volvía a mezclar
archivos distintos.

## Tests

```bash
cd deploy-board && npm test
```

524 tests. **No tocan red ni base**: el cliente de ADO, `git` y `sqlcmd` entran por inyección.

⚠️ `node --test` sin argumentos también toma `test-*.{js,cjs,mjs}` de cualquier lugar del
árbol. Un archivo suelto con ese nombre suma tests fantasma al conteo.

## Estructura

```
src/parser/        nombre de archivo, encoding (UTF-16LE de SSMS), objetos del cuerpo SQL
src/sondas/        derivar sondas, armar la consulta, veredicto por ambiente
src/ado/           cliente de Azure DevOps
src/fuentes/       descubrimiento: los .sql de los adjuntos y los de DB_Migrations, los dos de Azure
src/reconciliador/ une las dos fuentes conservando el desacuerdo
src/desvios/       escalera de estados y las trece reglas
src/db/            ejecutor de sondas por sqlcmd
src/reporte.js     modelo y formato del reporte
src/enMain.js      compara un script contra la rama main del repo: 'igual' | 'distinta' | null
src/medir.js       la barrida completa, que usan la consola y el tablero
src/sprints.js     emparejar la iteracion de Azure con la carpeta del repo
src/sprints-ado.js  las listas que llena el selector, y cual es el sprint en curso
src/vista.js       proyección del reporte al modelo que consume la pantalla
src/marcas.js      las decisiones de una persona: subido a main, no tener en cuenta
src/almacen.js     dónde se guardan esas decisiones y la última medición
src/servidor.js    el tablero local (node:http, sin dependencias)
src/actualizador.js  deja la carpeta del sistema igual a origin/main (arranque y boton)
src/actualizar-cli.js  la actualizacion al arrancar, que corre arrancar.bat
src/entorno.js     lector de .env propio (sin depender de la version de Node)
src/servidor-cli.js  arranque del tablero
src/cli.js         arranque de la consola
web/               la pantalla: HTML, CSS y JS de navegador, sin bundler
iniciar.bat           arranca el sistema; no se modifica nunca (ver Como se actualiza)
scripts/arrancar.bat  actualiza, levanta y reinicia; corre desde una copia en TEMP
scripts/publicar.mjs  copia el sistema al clon de FidelWorkSpace para el PR
scripts/abrir.ps1     levanta el tablero y abre el navegador
```

`parser`, `sondas` (derivar/consulta/veredicto), `reconciliador`, `desvios`, `roles`, `vista`,
`marcas` y `enMain` son **puros**: se testean en memoria, sin red ni base. El servidor se
testea por su manejador, sin abrir un socket.

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
