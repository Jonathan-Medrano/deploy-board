import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const leer = (rel) => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

// cmd.exe lee un .bat por posicion de byte mientras lo ejecuta. Si un pull cambia
// iniciar.bat en medio de una corrida, sigue desde un offset que ya no corresponde. Por eso
// iniciar.bat no hace pull ni corre nada que pueda cambiar: solo copia arrancar.bat a una
// copia PROPIA de esta instancia en TEMP (nombre con %RANDOM%, para no pisar otra ventana
// que este corriendo al mismo tiempo) y lo llama desde ahi.
test('iniciar.bat no hace git pull: lo hace la copia de arrancar.bat en TEMP', () => {
  const ini = leer('iniciar.bat');
  assert.doesNotMatch(ini, /git\s+pull/i);
  assert.match(ini, /set\s+"COPIA=%TEMP%\\deploy-board-arrancar-%RANDOM%%RANDOM%\.bat"/i);
  assert.match(ini, /copy\s+\/y\s+"%~dp0scripts\\arrancar\.bat"\s+"%COPIA%"/i);
  assert.match(ini, /call\s+"%COPIA%"/i);
});

test('el reinicio por codigo 10 vuelve a copiar arrancar.bat, asi toma la version nueva', () => {
  const ini = leer('iniciar.bat');
  const copia = ini.search(/copy\s+\/y/i);
  const etiqueta = ini.search(/^:otra\b/im);
  assert.ok(etiqueta >= 0 && etiqueta < copia, 'la etiqueta del loop va ANTES de la copia');
  // El chequeo del errorlevel va pegado al call, sin un "set" en el medio del que dependa:
  // el reinicio se decide y se marca (MODO=reinicio) en el mismo if, no antes.
  assert.match(ini, /if errorlevel 10 if not errorlevel 11 \(set "MODO=reinicio" & goto otra\)/i);
});

test('arrancar.bat trae el pull y el servidor, y saltea el pull en un reinicio', () => {
  const arr = leer('scripts/arrancar.bat');
  assert.match(arr, /git pull --ff-only/);
  assert.match(arr, /node src\/servidor-cli\.js/);
  assert.match(arr, /"%~2"=="reinicio"/i);
});
