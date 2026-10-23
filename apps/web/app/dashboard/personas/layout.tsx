'use client';

/**
 * Shell del módulo Personas: barra lateral del dashboard + barra superior con
 * la ruta («Colegio · Personas · Empleados»), tal como el frame 03 · Personas.
 *
 * Gate de acceso: `usuarios.ver` o `estudiantes.ver` (o admin). Cada endpoint
 * vuelve a validar el permiso de su dominio, esto es solo la experiencia.
 */
import { usePathname } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useSesion } from '@/hooks/useSesion';

/** Sección que se muestra en la barra superior según la ruta. */
function seccionDeRuta(ruta: string): string {
  if (ruta.includes('/personas/empleados/nuevo')) return 'Nuevo empleado';
  if (ruta.includes('/personas/empleados')) return 'Empleados';
  if (ruta.includes('/personas/estudiantes')) return 'Estudiantes';
  if (ruta.includes('/personas/acudientes')) return 'Acudientes';
  if (ruta.includes('/personas/roles')) return 'Roles';
  return 'Personas';
}

export default function PersonasLayout({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const { data: sesion } = useSesion();

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeEntrar =
    sesionColegio !== null &&
    (sesionColegio.esAdmin ||
      sesionColegio.permisos.includes('usuarios.ver') ||
      sesionColegio.permisos.includes('estudiantes.ver'));

  const nombreColegio =
    sesionColegio?.colegio.nombre ?? 'EduPlatform';
  const breadcrumb = `${nombreColegio} · Personas · ${seccionDeRuta(ruta)}`;

  return (
    <DashboardShell seccion="personas" breadcrumb={breadcrumb}>
      {sesion !== undefined && sesion.tipo !== 'colegio' ? (
        <ErrorBanner
          tono="aviso"
          icono="info"
          titulo="Módulo del colegio"
          mensaje="Esta sección es para el personal de un colegio."
        />
      ) : sesion !== undefined && !puedeEntrar ? (
        <ErrorBanner
          tono="aviso"
          icono="lock"
          titulo="Sin acceso"
          mensaje="No tienes permiso para ver Personas. Pídeselo al administrador del colegio."
        />
      ) : (
        children
      )}
    </DashboardShell>
  );
}