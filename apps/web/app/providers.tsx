'use client';

/**
 * Providers globales del frontend.
 * TanStack Query = caché de datos de servidor: dedupe de llamadas
 * concurrentes, revalidación en background y reintentos con backoff.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  // Un QueryClient por árbol de React (nunca global: recomendación oficial SSR).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
