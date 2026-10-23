'use client';

/**
 * Shell del módulo Personas: fondo, tarjeta, título, subtítulo del colegio y
 * pestañas. Las páginas hijas ponen su barra de herramientas y su contenido.
 *
 * Gate de acceso: `usuarios.ver` o `estudiantes.ver` (o admin). Cada endpoint
 * vuelve a validar el permiso de su dominio, esto es solo la experiencia.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PaperBg } from '@/components/PaperBg';
import { PersonasTabs } from '@/components/personas/PersonasTabs';
import { useSesion } from '@/hooks/useSesion';

export default function PersonasLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: sesion, isError } = useSesion();

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeEntrar =
    sesionColegio !== null &&
    (sesionColegio.esAdmin ||
      sesionColegio.permisos.includes('usuarios.ver') ||
      sesionColegio.permisos.includes('estudiantes.ver'));

  return (
    <>
      <PaperBg />
      <main className="stage" id="contenido-principal">
        <div className="stage-card page-card fade">
          <div className="page-topbar">
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 className="m3-headline-small" style={{ margin: 0 }}>
                Personas
              </h1>
              <p
                className="m3-body-small page-subtitulo"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                {sesionColegio?.colegio.nombre ?? 'Empleados, estudiantes, acudientes y roles'}
              </p>
            </div>
          </div>

          {sesion === undefined ? (
            <p className="m3-body-medium">Cargando…</p>
          ) : sesion.tipo !== 'colegio' ? (
            <ErrorBanner
              tono="aviso"
              icono="info"
              titulo="Módulo del colegio"
              mensaje="Esta sección es para el personal de un colegio."
            />
          ) : !puedeEntrar ? (
            <ErrorBanner
              tono="aviso"
              icono="lock"
              titulo="Sin acceso"
              mensaje="No tienes permiso para ver Personas. Pídeselo al administrador del colegio."
            />
          ) : (
            <>
              <PersonasTabs />
              {children}
            </>
          )}
        </div>
      </main>
    </>
  );
}