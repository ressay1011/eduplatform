/**
 * NIT colombiano — normalización, forma y dígito de verificación.
 *
 * La DIAN documenta el formato `XXX.XXX.XXX-Y`, pero el registro admite NIT de
 * 8 a 15 dígitos antes del verificador y los colegios públicos usan a veces el
 * NIT del municipio o del fondo de servicios educativos. Una regla estricta de
 * «9 + 1» rechazaría casos reales, así que `esNitValido` acepta de 8 a 15
 * dígitos con el verificador opcional.
 *
 * Vive aquí (y no en la web) porque la regla tiene que ser la MISMA en el
 * formulario y en la API: `ColegioOnboardingSchema` la aplica con `refine`.
 */

/** Quita puntos y espacios: `900.123.456-7` → `900123456-7`. */
export function normalizarNit(valor: string): string {
  return valor.replace(/[.\s]/g, '');
}

/** Forma válida: de 8 a 15 dígitos, con un único dígito de verificación opcional. */
export function esNitValido(valor: string): boolean {
  return /^\d{8,15}(-\d)?$/.test(normalizarNit(valor));
}

/**
 * Pesos de la DIAN, aplicados de derecha a izquierda sobre la base del NIT.
 * Alcanzan para 15 dígitos, el máximo que se acepta.
 */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/**
 * Dígito de verificación de la DIAN (módulo 11).
 *
 * Suma cada dígito de la base por su peso (de derecha a izquierda), toma el
 * resto de dividir entre 11 y: si el resto es 0 o 1 el verificador es el resto;
 * si no, es 11 menos el resto. Devuelve `null` si la base no tiene entre 8 y 15
 * dígitos.
 *
 * OJO: no se aplica al guardar. Hay NIT reales capturados sin verificador o con
 * uno que no cuadra (el del ejemplo del formulario, `900123456-7`, tendría que
 * ser 8), y rechazarlos rompería colegios ya registrados. Sirve para avisar, no
 * para bloquear.
 */
export function digitoVerificadorNit(nit: string): number | null {
  const base = normalizarNit(nit).split('-')[0] ?? '';
  if (!/^\d{8,15}$/.test(base)) return null;
  const suma = [...base]
    .reverse()
    .reduce((total, digito, indice) => total + Number(digito) * (PESOS[indice] ?? 3), 0);
  const resto = suma % 11;
  return resto < 2 ? resto : 11 - resto;
}
