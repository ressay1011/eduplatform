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
 * NIT colombiano. La DIAN documenta el formato XXX.XXX.XXX-Y, pero el registro
 * admite NIT de 8 e incluso 15 dígitos antes del verificador, y los colegios
 * públicos usan a veces el NIT del municipio o del fondo de servicios
 * educativos: una regla estricta de «9 + 1» rechazaría casos reales, así que se
 * acepta de 8 a 15 dígitos con un verificador opcional.
 */
export function normalizarNit(valor: string): string {
  return valor.replace(/[.\s]/g, '');
}

export function esNitValido(valor: string): boolean {
  return /^\d{8,15}(-\d)?$/.test(normalizarNit(valor));
}

/** Teléfono: de 7 a 12 dígitos (con +57 deja 12), con espacios, paréntesis y guiones. */
export function esTelefonoValido(valor: string): boolean {
  if (!/^[\d\s()+-]+$/.test(valor)) return false;
  const digitos = valor.replace(/\D/g, '');
  return digitos.length >= 7 && digitos.length <= 12;
}
