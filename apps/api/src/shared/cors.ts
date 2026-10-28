/**
 * Orígenes permitidos del CORS.
 *
 * `CORS_ORIGINS` es una lista separada por comas. Cada elemento puede ser un
 * origen EXACTO (`https://eduplatform-ivory.vercel.app`) o llevar `*` para
 * cubrir una familia de dominios efímeros: los previews de Vercel cambian de
 * URL en cada deploy (`https://eduplatform-<hash>-<team>.vercel.app`), así que
 * el entorno de pruebas usa `https://eduplatform-*-<team>.vercel.app`.
 *
 * El comodín representa UNA etiqueta DNS (`[a-z0-9-]+`): no cruza puntos, `:`
 * ni `/`, así que no puede saltar de un dominio a otro. Producción no lleva
 * comodines y se comporta exactamente como antes.
 */

/** Parte la variable de entorno en orígenes, sin espacios ni entradas vacías. */
export function origenesPermitidos(valor: string): string[] {
  return valor
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen !== '');
}

/** ¿El origen de la petición está en la lista (exacto o por comodín)? */
export function origenPermitido(origen: string, permitidos: readonly string[]): boolean {
  return permitidos.some((patron) =>
    patron.includes('*') ? coincideComodin(patron, origen) : patron === origen,
  );
}

function coincideComodin(patron: string, origen: string): boolean {
  const partes = patron.split('*').map(escaparRegex);
  return new RegExp(`^${partes.join('[a-z0-9-]+')}$`).test(origen);
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
