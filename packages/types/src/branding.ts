/**
 * Paleta del colegio, generada desde sus tres colores semilla.
 *
 * Se calcula una vez (al guardar los colores en la personalización del colegio)
 * y se guarda ya resuelta: así todos ven lo mismo, no se recalcula en cada carga
 * y un cambio de algoritmo no altera las paletas existentes hasta recomputarlas
 * (`version` dice con qué versión se generaron).
 *
 * Los nombres de rol son los de Material 3 sin el prefijo `--md-sys-color-`:
 * `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `secondary`,
 * `tertiary`, `surfaceTint`… Los roles neutros (`surface`, `outline`,
 * `onSurface`) NO van aquí: siguen saliendo de la Foundation para que un colegio
 * no pueda dejar la interfaz ilegible.
 */
export interface PaletaColegio {
  /** Sube cuando cambia el algoritmo de generación. */
  version: number;
  /** ISO-8601 de cuándo se calculó (informativo). */
  generadoEn?: string;
  /** Los colores que eligió el colegio, en hexadecimal. */
  semillas: {
    primario: string;
    secundario?: string;
    terciario?: string;
  };
  /** Roles resueltos para el tema claro (rol → hex). */
  claro: Record<string, string>;
  /** Roles resueltos para el tema oscuro (rol → hex). */
  oscuro: Record<string, string>;
}
