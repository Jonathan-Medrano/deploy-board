import { traerCambios } from './actualizador.js';

// Lo corre scripts\arrancar.bat antes de levantar el servidor. Nunca corta el arranque: el
// sistema mide scripts, no depende de estar al dia.
const r = traerCambios({ cwd: process.cwd() });

if (r.esDesarrollo) console.log(`  ${r.mensaje}`);
else if (!r.ok) console.log(`  [!] No traje cambios: ${r.mensaje} Arranco igual.`);
else console.log(r.reiniciar ? `  ${r.mensaje}` : '  Al dia.');
