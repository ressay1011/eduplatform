'use client';

/**
 * Pestañas del módulo Personas (chips de 32 px del diseño aprobado).
 * Navegación por URL: cada pestaña es una ruta y `aria-selected` marca la activa.
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
    <nav className="per-tabs" role="tablist" aria-label="Secciones de Personas">
      {PESTANAS.map((pestana) => {
        const activa = ruta.startsWith(pestana.href);
        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            role="tab"
            aria-selected={activa}
            className="per-tab"
          >
            {pestana.texto}
            {activa ? (
              <span className="material-symbols-outlined" aria-hidden="true">
                check
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}