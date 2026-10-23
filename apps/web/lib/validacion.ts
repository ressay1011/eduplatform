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
