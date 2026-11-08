/**
 * Validaciones de entrada del login.
 *
 * El correo se valida sin expresión regular: la que había
 * (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) tiene retroceso superlineal según Sonar
 * (S8786) y además rechaza/acepta casos raros de forma difícil de razonar.
 * Aquí se comprueba la estructura por partes, en tiempo lineal.
 */
export function esEmailValido(valor: string): boolean {
  if (valor.length === 0 || valor.length > 254) return false;
  if (/\s/.test(valor)) return false;

  const partes = valor.split('@');
  if (partes.length !== 2) return false;

  const local = partes[0] ?? '';
  const dominio = partes[1] ?? '';
  if (local.length === 0 || local.length > 64) return false;

  const etiquetas = dominio.split('.');
  if (etiquetas.length < 2) return false;

  return etiquetas.every(
    (etiqueta) =>
      etiqueta.length > 0 &&
      etiqueta.length <= 63 &&
      !etiqueta.startsWith('-') &&
      !etiqueta.endsWith('-'),
  );
}

/**
 * NIT y su validación viven en `@eduplatform/types`: la misma regla tiene que
 * correr en el wizard y en el `ColegioOnboardingSchema` de la API.
 */
export { digitoVerificadorNit, esNitValido, normalizarNit } from '@eduplatform/types';
/**
 * Nombre de usuario del colegio (no es un correo): 3–64 caracteres, letras en
 * cualquier caja, números, punto, guion, guion bajo y `@`, sin espacios.
 * Espejo de `UsuarioSchema` de @eduplatform/types.
 */
export function esUsuarioValido(valor: string): boolean {
  return (
    /^[A-Za-z0-9](?:[A-Za-z0-9._@-]*[A-Za-z0-9])$/.test(valor) &&
    valor.length >= 3 &&
    valor.length <= 64
  );
}

/** Teléfono: de 7 a 12 dígitos (con +57 deja 12), con espacios, paréntesis y guiones. */
export function esTelefonoValido(valor: string): boolean {
  if (!/^[\d\s()+-]+$/.test(valor)) return false;
  const digitos = valor.replace(/\D/g, '');
  return digitos.length >= 7 && digitos.length <= 12;
}
