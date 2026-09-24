// Quien ejecuta un script depende del AMBIENTE, no de quien lo escribio. Lo que falta en el
// destino de una promocion (dev <-> stage) lo corre quien este a cargo de ejecutar scripts ese
// dia: es un rol, y se muestra como rol. Antes salia el nombre del .env, que cambia de persona
// y aparecia como un grupo aparte de la misma persona que tambien era autora.
// Produccion sigue configurable: sin configurar, el desvio sale sin nombre, nunca inventado.
export const ENCARGADO_DE_EJECUTAR = 'Encargado de ejecutar scripts';

export function rolesDesde(env = process.env) {
  return {
    promocion: ENCARGADO_DE_EJECUTAR,
    produccion: env.RESPONSABLE_PRODUCCION || null,
  };
}
