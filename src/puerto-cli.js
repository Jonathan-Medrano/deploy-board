import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivosEnv, cargarEnv, puertoDelEntorno } from './entorno.js';

// Lo lee arrancar.bat para abrir el navegador en el mismo puerto en el que escucha el servidor.
cargarEnv(archivosEnv(path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
console.log(puertoDelEntorno());
