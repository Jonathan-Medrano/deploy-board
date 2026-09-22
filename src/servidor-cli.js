import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarEnv } from './entorno.js';
import { crearServidor, RAIZ } from './servidor.js';

// El .env de al lado primero, y despues el del task runner si esta: en la maquina de un dev
// que ya tiene el task runner andando, no hace falta copiar el PAT dos veces.
cargarEnv([path.join(RAIZ, '.env'), path.join(RAIZ, '..', 'taskrunner', '.env')]);

// Puerto propio y fijo: el task runner esta en 4600 y los dev servers por worktree arrancan en
// los 3000/4300. 4700 no pisa a nadie. Se puede mover con DEPLOY_BOARD_PORT.
const PUERTO = Number(process.env.DEPLOY_BOARD_PORT || 4700);

function opcionesDelEntorno(env = process.env) {
  return {
    iteracion: env.DEPLOY_BOARD_ITERACION || undefined,
    sprint: env.DEPLOY_BOARD_SPRINT || undefined,
    ambientes: (env.DEPLOY_BOARD_AMBIENTES || 'dev,stage').split(',').map((s) => s.trim()).filter(Boolean),
    destino: env.DEPLOY_BOARD_DESTINO || 'stage',
  };
}

const servidor = crearServidor({ opciones: opcionesDelEntorno() });

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${PUERTO} ya esta ocupado. Si es otro deploy-board, abrilo en http://localhost:${PUERTO}. Si no, cambia DEPLOY_BOARD_PORT.`);
    process.exit(1);
  }
  throw e;
});

// Solo localhost: la pantalla muestra el sprint entero de la empresa y no tiene login. Atarla a
// 0.0.0.0 la publica en la red de la oficina sin que nadie lo haya decidido.
servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`deploy-board escuchando en http://localhost:${PUERTO}`);
});
