'use client';

/**
 * Puerta del área privada: sesión, contraseña temporal y onboarding pendiente.
 *
 * Va en `app/dashboard/layout.tsx` para que aplique a TODAS las páginas del
 * panel. Antes la comprobación del wizard vivía solo en `DashboardShell`, que
 * usan las subpáginas; `/dashboard` tiene su propia maqueta y se la saltaba,
 * así que un colegio sin configurar aterrizaba en el panel en vez de en el
 * wizard.
 *
 * Mientras decide no pinta nada: si no, el dashboard aparece un instante antes
 * de redirigir.
 */
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSesion } from '@/hooks/useSesion';
import { getOnboarding } from '@/lib/api';

export function GuardiaAcceso({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: sesion, isError } = useSesion();

  const esAdminColegio = sesion?.tipo === 'colegio' && sesion.usuario.esAdmin;
  const debeCambiarPassword = sesion?.tipo === 'colegio' && sesion.usuario.debeCambiarPassword;

  // El wizard es obligatorio para el admin hasta cerrarlo (mínimo: sede+curso).
  const { data: onboarding } = useQuery({
    queryKey: ['onboarding'],
    queryFn: getOnboarding,
    enabled: esAdminColegio === true,
    retry: false,
    staleTime: 30_000,
  });

  const onboardingPendiente =
    esAdminColegio === true && onboarding !== undefined && !onboarding.completado;

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  useEffect(() => {
    if (debeCambiarPassword === true) router.replace('/cambiar-password');
  }, [debeCambiarPassword, router]);

  useEffect(() => {
    if (onboardingPendiente) router.replace('/onboarding');
  }, [onboardingPendiente, router]);

  const esperando =
    sesion === undefined ||
    debeCambiarPassword === true ||
    (esAdminColegio === true && onboarding === undefined);

  if (esperando) {
    return (
      <div className="dash-page dash-cargando">
        <p className="m3-body-medium" aria-live="polite">
          Cargando tu colegio…
        </p>
      </div>
    );
  }

  if (onboardingPendiente) return null;

  return <>{children}</>;
}
