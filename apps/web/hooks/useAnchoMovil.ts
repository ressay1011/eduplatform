/**
 * ¿La ventana está en el ancho de teléfono (≤ 600 px)?
 *
 * Se resuelve con `matchMedia` y no solo con CSS porque la barra de acciones
 * cambia de SITIO: en escritorio y tableta el CTA vive en la cabecera y el pie
 * solo lleva «Guardar y salir»; en el teléfono los dos van al pie. Renderizar
 * los dos y ocultar uno dejaría dos botones con el mismo nombre accesible.
 *
 * Sin `matchMedia` (jsdom en los tests) devuelve `false`: se prueba el layout de
 * escritorio.
 */
import { useEffect, useState } from 'react';

/** Ancho por debajo del cual el wizard usa la barra apilada del pie. */
export const ANCHO_MOVIL = '(max-width: 600px)';

export function useAnchoMovil(): boolean {
  const [movil, setMovil] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const consulta = window.matchMedia(ANCHO_MOVIL);
    const actualizar = (): void => setMovil(consulta.matches);
    // Primera lectura en el efecto: en el servidor no hay ventana y el estado
    // inicial es `false` para que la hidratación no cambie de rama.
    actualizar();
    consulta.addEventListener('change', actualizar);
    return () => consulta.removeEventListener('change', actualizar);
  }, []);

  return movil;
}
