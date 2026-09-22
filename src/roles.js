// Quien ejecuta un script depende del AMBIENTE, no de quien lo escribio, y los nombres de
// esos roles NO se hardcodean: un rol cambia de persona, y un nombre incrustado en el codigo
// envejece mal porque nadie se acuerda de actualizarlo. Sin configurar, el desvio sale sin
// nombre — nunca con uno inventado.
export function rolesDesde(env = process.env) {
  return {
    promocion: env.RESPONSABLE_PROMOCION || null,
    produccion: env.RESPONSABLE_PRODUCCION || null,
  };
}
