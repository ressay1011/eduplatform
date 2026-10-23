'use client';

/**
 * Personas → Roles.
 * Tarjetas con cada rol del colegio: tipo de persona, permisos y personas
 * asignadas; acciones de editar, duplicar y eliminar (los predeterminados no
 * se borran y un rol en uso tampoco).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { useDuplicarRol, useEliminarRol, useRoles } from '@/hooks/usePersonas';
import { useSesion } from '@/hooks/useSesion';

const ETIQUETA_TIPO: Record<string, string> = {
  EMPLEADO: 'Empleado',
  ESTUDIANTE: 'Estudiante',
  ACUDIENTE: 'Acudiente',
};

export default function RolesPage() {
  const router = useRouter();
  const { data: sesion } = useSesion();
  const { data, isLoading, isError, error } = useRoles();
  const duplicar = useDuplicarRol();
  const eliminar = useEliminarRol();
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeEditar =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('configuracion.editar'));

  const borrar = (id: string, nombre: string): void => {
    setErrorAccion(null);
    const confirmado = window.confirm(`¿Eliminar el rol «${nombre}»? Esta acción no se puede deshacer.`);
    if (!confirmado) return;
    eliminar.mutate(id, {
      onError: (fallo) => setErrorAccion(fallo.message),
    });
  };

  return (
    <>
      <div className="toolbar">
        <p className="m3-body-medium" style={{ flex: 1, margin: 0, color: 'var(--md-sys-color-on-surface-variant)' }}>
          Un rol agrupa permisos. Cada persona tiene un solo rol y el alcance por sede se asigna aparte.
        </p>
        {puedeEditar ? (
          <M3Button onClick={() => router.push('/dashboard/personas/roles/nuevo')} icono="add">
            Nuevo rol
          </M3Button>
        ) : null}
      </div>

      {errorAccion !== null ? (
        <ErrorBanner tono="aviso" titulo="No se pudo completar la acción" mensaje={errorAccion} />
      ) : null}

      {isError ? (
        <ErrorBanner
          titulo="No pudimos cargar los roles"
          mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
        />
      ) : isLoading ? (
        <p className="m3-body-medium">Cargando roles…</p>
      ) : data === undefined || data.items.length === 0 ? (
        <p className="vacio m3-body-medium">El colegio aún no tiene roles.</p>
      ) : (
        <div className="roles-grid">
          {data.items.map((rol) => (
            <article key={rol.id} className="rol-card">
              <h3>{rol.nombre}</h3>
              <p className="rol-desc">{rol.descripcion ?? 'Sin descripción'}</p>
              <div className="rol-meta">
                <span className="m3-chip small">
                  <span className="m3-label-medium">{ETIQUETA_TIPO[rol.tipoPersona] ?? rol.tipoPersona}</span>
                </span>
                <span className="m3-chip small">
                  <span className="m3-label-medium">{rol.permisos.length} permisos</span>
                </span>
                <span className="m3-chip small">
                  <span className="m3-label-medium">
                    {rol.personas} {rol.personas === 1 ? 'persona' : 'personas'}
                  </span>
                </span>
                {rol.esPredeterminado ? (
                  <span className="m3-chip small selected">
                    <span className="m3-label-medium">PREDETERMINADO</span>
                  </span>
                ) : null}
                {!rol.activo ? (
                  <span className="m3-chip small estado-inactivo">
                    <span className="m3-label-medium">INACTIVO</span>
                  </span>
                ) : null}
              </div>
              <div className="rol-acciones">
                <M3Button
                  variante="tonal"
                  icono="edit"
                  onClick={() => router.push(`/dashboard/personas/roles/${rol.id}`)}
                >
                  Editar
                </M3Button>
                {puedeEditar ? (
                  <>
                    <M3Button
                      variante="text"
                      icono="content_copy"
                      onClick={() =>
                        duplicar.mutate(rol.id, { onError: (fallo) => setErrorAccion(fallo.message) })
                      }
                    >
                      Duplicar
                    </M3Button>
                    {!rol.esPredeterminado ? (
                      <M3Button variante="text" icono="delete" onClick={() => borrar(rol.id, rol.nombre)}>
                        Eliminar
                      </M3Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {data !== undefined ? (
        <p className="m3-body-small" style={{ marginTop: 16, color: 'var(--md-sys-color-on-surface-variant)' }}>
          {data.items.length} roles · los predeterminados se pueden editar pero no eliminar
        </p>
      ) : null}
    </>
  );
}