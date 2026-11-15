/**
 * Sedes que propone el MEN en el paso 3: cuáles ya están creadas y cuáles
 * faltan. Vive en `lib/` (con su spec) para que la página solo pinte.
 */
import type { SedeMen, SedeOnboarding } from '@eduplatform/types';

/**
 * Clave de comparación: sin tildes, sin caja, con espacios normalizados y sin
 * el prefijo «Sede» (el asistente propone «Sede Principal» y el MEN, «Principal»).
 */
function clave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^sede\s+/, '');
}

/**
 * ¿La sede del MEN ya existe en el colegio?
 *
 * Se reconoce por su código DANE de sede o por su nombre (sin tildes ni caja).
 * La principal tiene el código del colegio: si el asistente ya creó una sede
 * llamada «Principal», también cuenta como cubierta.
 */
export function yaLaTienes(men: SedeMen, sedes: SedeOnboarding[]): boolean {
  const porCodigo = sedes.some(
    (s) =>
      s.codigoDaneSede !== null &&
      s.codigoDaneSede.trim() !== '' &&
      s.codigoDaneSede === men.codigoDaneSede,
  );
  if (porCodigo) return true;
  if (sedes.some((s) => clave(s.nombre) === clave(men.nombre))) return true;
  return men.esPrincipal && sedes.some((s) => clave(s.nombre) === 'principal');
}

/** Las que hay que crear: las del MEN que todavía no están en el colegio. */
export function sedesPendientes(men: SedeMen[], sedes: SedeOnboarding[]): SedeMen[] {
  return men.filter((sede) => !yaLaTienes(sede, sedes));
}
