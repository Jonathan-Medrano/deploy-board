import { archivosEnv, cargarEnv, puertoDelEntorno } from './entorno.js';
import { crearServidor, RAIZ } from './servidor.js';

cargarEnv(archivosEnv(RAIZ));

const PUERTO = puertoDelEntorno();

function opcionesDelEntorno(env = process.env) {
  return {
    iteracion: env.DEPLOY_BOARD_ITERACION || undefined,
    sprint: env.DEPLOY_BOARD_SPRINT || undefined,
    ambientes: (env.DEPLOY_BOARD_AMBIENTES || 'dev,stage').split(',').map((s) => s.trim()).filter(Boolean),
    destino: env.DEPLOY_BOARD_DESTINO || 'stage',
  };
}

const servidor = crearServidor({ opciones: opcionesDelEntorno(), puerto: PUERTO });

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
