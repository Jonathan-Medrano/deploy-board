// Lo que una persona DECIDE sobre un script: que ya lo subio a main, o que este no va en esta
// subida. No es una medicion — main no se sondea nunca — asi que se guarda con nombre y fecha:
// un hecho registrado sin autor no se puede discutir despues.
export const ESTADO_VACIO = Object.freeze({ marcas: {}, ignorados: {} });

const LISTAS = ['marcas', 'ignorados'];

export function normalizar(crudo) {
  const o = crudo && typeof crudo === 'object' ? crudo : {};
  const out = { marcas: {}, ignorados: {} };
  for (const l of LISTAS) if (o[l] && typeof o[l] === 'object') out[l] = { ...o[l] };
  return out;
}

export function aplicarCambio(estado, { tipo, id, poner, quien = null, fecha = null, motivo = '' }) {
  const lista = tipo === 'marca' ? 'marcas' : tipo === 'ignorado' ? 'ignorados' : null;
  if (!lista) throw new Error(`tipo "${tipo}" no existe: esperaba "marca" o "ignorado".`);
  if (!id || typeof id !== 'string') throw new Error('id vacio: una clave vacia pisa la entrada siguiente.');

  const base = normalizar(estado);
  const copia = { ...base[lista] };
  if (poner) {
    copia[id] = lista === 'marcas'
      ? { subidoAMain: true, fecha, por: quien }
      : { fecha, por: quien, motivo: String(motivo || '') };
  } else {
    // Se BORRA en vez de guardar `false`: una entrada apagada y una entrada ausente significan
    // lo mismo, y tener las dos formas obliga a todo lector a manejar el caso.
    delete copia[id];
  }
  return { ...base, [lista]: copia };
}
