'use client';

/**
 * Pestañas del módulo Personas. Navegación por URL (cada pestaña es una ruta),
 * con `aria-selected` para lectores de pantalla.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PESTANAS = [
  { href: '/dashboard/personas/empleados', texto: 'Empleados' },
  { href: '/dashboard/personas/estudiantes', texto: 'Estudiantes' },
  { href: '/dashboard/personas/acudientes', texto: 'Acudientes' },
  { href: '/dashboard/personas/roles', texto: 'Roles' },
] as const;

export function PersonasTabs() {
  const ruta = usePathname();
  return (
    <nav className="personas-tabs" role="tablist" aria-label="Secciones de Personas">
      {PESTANAS.map((pestana) => {
        const activa = ruta.startsWith(pestana.href);
        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            role="tab"
            aria-selected={activa}
            className="personas-tab"
          >
            {pestana.texto}
          </Link>
        );
      })}
    </nav>
  );
}