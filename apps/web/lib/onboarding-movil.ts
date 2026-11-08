/**
 * Onboarding · gestos de paso y arranque del wizard.
 *
 * La lógica vive aquí, fuera de la página, para probarla sin montar el wizard:
 * la página solo traduce eventos (toque, tecla) a estas funciones puras.
 */

/** Píxeles que debe recorrer el dedo para que cuente como cambio de paso. */
export const UMBRAL_GESTO = 60;

/** Cuánto tiene que dominar el desplazamiento horizontal al vertical. */
const DOMINIO_HORIZONTAL = 1.5;

export interface Punto {
  x: number;
  y: number;
}

export type GestoDePaso = 'atras' | 'adelante' | null;

/**
 * Traduce el recorrido de un dedo a un cambio de paso.
 *
 * Hacia la izquierda avanza (como pasar página) y hacia la derecha vuelve. En
 * los dos sentidos el movimiento tiene que ser horizontal, para no robarle el
 * scroll vertical a la página, y el paso destino tiene que existir:
 * `puedeAvanzar` es el mismo requisito que habilita el botón de continuar, así
 * que el gesto no se salta ninguna validación.
 */
export function gestoDePaso(
  inicio: Punto,
  fin: Punto,
  opciones: { puedeAvanzar: boolean; puedeVolver: boolean },
): GestoDePaso {
  const dx = fin.x - inicio.x;
  const dy = fin.y - inicio.y;
  if (Math.abs(dx) < UMBRAL_GESTO) return null;
  if (Math.abs(dx) <= Math.abs(dy) * DOMINIO_HORIZONTAL) return null;
  if (dx < 0) return opciones.puedeAvanzar ? 'adelante' : null;
  return opciones.puedeVolver ? 'atras' : null;
}

/**
 * La bienvenida solo tiene sentido en un colegio recién creado: sin código
 * DANE, sin sedes y todavía en el paso 1. Con cualquier avance guardado, el
 * admin entra directo al paso que le toca.
 */
export function necesitaBienvenida(estado: {
  paso: number;
  sedes: readonly unknown[];
  colegio: { codigoDane: string };
}): boolean {
  return estado.paso <= 1 && estado.sedes.length === 0 && estado.colegio.codigoDane.trim() === '';
}
