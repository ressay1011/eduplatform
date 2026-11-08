'use client';

/**
 * Mantiene el branding del colegio entre recargas y cambios de tema.
 *
 * El `<script>` del layout raíz ya pinta lo guardado antes del primer frame;
 * esto cubre la navegación en cliente y el cambio de tema (las variables son
 * inline, así que hay que recalcularlas al pasar de claro a oscuro) y refresca
 * la paleta desde la API por si el colegio cambió de colores. Si la petición
 * falla, se queda con lo guardado.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, claveCodigo, getContextoColegio } from '@/lib/api';
import { aplicarPaleta, guardarPaleta, leerPaletaGuardada, limpiarPaleta } from '@/lib/branding';

export function BrandingProvider() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const guardado = leerPaletaGuardada();
    if (guardado === null) return;

    const tema = window.matchMedia('(prefers-color-scheme: dark)');
    const aplicar = (): void => aplicarPaleta(guardado.paleta);
    aplicar();
    tema.addEventListener('change', aplicar);

    void queryClient
      .fetchQuery({
        queryKey: claveCodigo(guardado.codigo),
        queryFn: () => getContextoColegio(guardado.codigo),
        staleTime: 5 * 60_000,
      })
      .then((contexto) => {
        if (contexto.palette === null) return;
        aplicarPaleta(contexto.palette, tema.matches);
        guardarPaleta(contexto.codigo, contexto.palette);
      })
      .catch((err: unknown) => {
        // Colegio borrado: no tiene sentido seguir pintando sus colores.
        if (err instanceof ApiError && err.status === 404) limpiarPaleta();
        // Cualquier otro fallo (sin red) deja los colores guardados intactos.
      });

    return () => tema.removeEventListener('change', aplicar);
  }, [queryClient]);

  return null;
}
