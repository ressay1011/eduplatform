/**
 * Fecha y año de HOY según el calendario del colegio (`America/Bogota`).
 *
 * `new Date().toISOString().slice(0, 10)` devuelve la fecha **UTC**: en Colombia
 * (UTC-5) a partir de las 19:00 ya es «mañana», así que una matrícula creada de
 * noche quedaba fechada al día siguiente, y el 31 de diciembre la ventana del
 * año lectivo se corría sola. El país no tiene horario de verano, de modo que la
 * zona es única y el desfase siempre es −5.
 *
 * Vive en su propio módulo, sin zod, para que puedan usarlo tanto la API como
 * los esquemas de `onboarding.ts` sin arrastrar la librería de validación.
 */

export const ZONA_COLEGIO = 'America/Bogota';

/**
 * Fecha de hoy en ISO corto (`AAAA-MM-DD`).
 *
 * El formato se compone a mano con `formatToParts`: del locale solo se toman los
 * números, sin depender de que `en-CA` formatee como AAAA-MM-DD. Recibe `ahora`
 * para poder probarla con instantes fijos.
 */
export function hoyLocal(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_COLEGIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Año en curso del calendario del colegio (el de `hoyLocal`). */
export function anioLocal(ahora: Date = new Date()): number {
  return Number(hoyLocal(ahora).slice(0, 4));
}
