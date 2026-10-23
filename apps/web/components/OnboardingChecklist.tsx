'use client';

/**
 * Tarjeta «Completa tu colegio» del dashboard.
 *
 * Solo aparece para el admin mientras el onboarding no esté cerrado y queden
 * ítems pendientes. Reutiliza el mismo estado del wizard (una sola query).
 */
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { M3Button } from './M3Button';
import { getOnboarding } from '@/lib/api';

export function OnboardingChecklist() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['onboarding'],
    queryFn: getOnboarding,
    retry: false,
    staleTime: 30_000,
  });

  if (data === undefined) return null;
  const pendientes = data.checklist.filter((c) => !c.hecho);
  if (data.completado && pendientes.length === 0) return null;

  return (
    <section className="onb-tarjeta" aria-label="Completa tu colegio">
      <div className="onb-tarjeta-cab">
        <div>
          <h2>Completa tu colegio</h2>
          <p>
            {data.completado
              ? 'El colegio ya está operativo; quedan tareas opcionales.'
              : 'Termina la configuración inicial para dejar el colegio listo.'}
          </p>
        </div>
        <M3Button onClick={() => router.push('/onboarding')}>
          {data.completado ? 'Revisar configuración' : 'Continuar configuración'}
        </M3Button>
      </div>
      <ul>
        {pendientes.map((c) => (
          <li key={c.clave}>
            <span aria-hidden>○</span>
            <div>
              <strong>{c.titulo}</strong>
              <p>{c.detalle}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
