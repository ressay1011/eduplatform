/** Iniciales para el avatar del colegio («Colegio Norte» → «CN»). */
export function inicialesDe(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  const iniciales = palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return iniciales.join('') || '?';
}
