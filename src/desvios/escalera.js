export const RANGOS = {
  'new': 0,
  'active': 1,
  // `Paused` es trabajo empezado y frizado, no trabajo que avanzo: comparte rango con `active`
  // para que una tarjeta pausada retome donde estaba en vez de contar como progreso.
  'paused': 1,
  'resolved': 2,
  'in test': 3,
  'in test con bug': 3,
  // `Testing` es el tester TRABAJANDO la tarjeta: ya salio de la cola (`in test`) pero todavia
  // no se dio por testeada, asi que va en el medio. Consecuencia buscada: una tarjeta en
  // `Testing` cuya task de SCRIPTS quedo atras SI dispara D1, y con un script sin correr en
  // stage NO dispara D4 — porque nadie la dio por testeada todavia.
  'testing': 4,
  'tested': 5,
  'closed': 6,
  'done': 6,
  'removed': -1,
};

const clave = (e) => String(e ?? '').trim().toLowerCase();

// `Object.hasOwn` y no un lookup directo: RANGOS es un objeto literal, asi que hereda de
// Object.prototype y `RANGOS['constructor']` devuelve una FUNCION. El contrato de esta
// funcion es number|null, y "desconocido devuelve null, nunca adivina" — una funcion no es
// ninguna de las dos cosas. Ningun estado de ADO se llama asi, pero el guard cuesta una linea
// y evita que el contrato dependa de que nadie elija mal un nombre.
export function rango(estado) {
  const k = clave(estado);
  return Object.hasOwn(RANGOS, k) ? RANGOS[k] : null;
}

export function validarEscalera(estadosReales) {
  return (estadosReales || []).filter((e) => !Object.hasOwn(RANGOS, clave(e)));
}
