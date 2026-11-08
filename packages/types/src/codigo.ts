/**
 * Identidad del colegio dentro del nombre de usuario: `admin@juanaArias`.
 *
 * Vive en su PROPIO módulo, sin zod, a propósito. `auth.ts` importa zod para
 * los esquemas y, en CommonJS, cualquier import de valor arrastraba el paquete
 * entero al navegador (~478 KB en el build de la web). Aquí la web solo se
 * lleva esta función; `auth.ts` la reexporta para no romper a quien ya la
 * importaba de ahí.
 */

/**
 * Colegio de un nombre de usuario: lo que va después de la última `@`
 * (`admin@juanaArias` → `juanaArias`). Es el **código** del colegio, no un
 * dominio de correo: no necesita TLD ni existir en DNS.
 *
 * Devuelve el sufijo en minúsculas (la comparación con el código es sin caja).
 */
export function sufijoDeUsuario(usuario: string): string | null {
  const limpio = usuario.trim().toLowerCase();
  const posicion = limpio.lastIndexOf('@');
  if (posicion <= 0 || posicion === limpio.length - 1) return null;
  const sufijo = limpio.slice(posicion + 1);
  return /^[a-z0-9ñ](?:[a-z0-9ñ-]{1,30}[a-z0-9ñ])$/.test(sufijo) ? sufijo : null;
}
