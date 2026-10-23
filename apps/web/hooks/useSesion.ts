'use client';

/** Hook de la sesión activa (/auth/me) con caché y dedupe de TanStack Query. */
import { useQuery } from '@tanstack/react-query';
import type { MeResponse } from '@eduplatform/types';
import { getSesion } from '@/lib/api';

/** Clave de caché de la sesión — invalidar/remover tras login/logout/cambio. */
export const SESION_KEY = ['sesion'] as const;

export function useSesion() {
  return useQuery<MeResponse>({
    queryKey: SESION_KEY,
    queryFn: getSesion,
    staleTime: 60_000,
    // Un 401 no se reintenta: no hay sesión y reintentar solo presiona la API.
    retry: false,
  });
}