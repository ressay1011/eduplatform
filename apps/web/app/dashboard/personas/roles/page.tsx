'use client';

/**
 * Personas → Roles — réplica del frame «Personas · Roles».
 * Nota gris de cabecera y tabla ROL / PERMISOS / PERSONAS / ORIGEN. Cada fila
 * abre el editor del rol; los predeterminados se editan pero no se borran.
 */
import { useRouter } from 'next/navigation';
import { useAviso } from '@/components/DashboardShell';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PersonasHeader } from '@/components/personas/PersonasHeader';
import { useRoles } from '@/hooks/usePersonas';
import { useSesion } from '@/hooks/useSesion';

export default function RolesPage() {
  const router = useRouter();
  const aviso = useAviso();
  const { data: sesion } = useSesion();
  const { data, isLoading, isError, error } = useRoles();

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeEditar =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('configuracion.editar'));

  const roles = data?.items ?? [];
  const predeterminados = roles.filter((rol) => rol.esPredeterminado).length;

  return (
    <div className="per-bloque">
      <PersonasHeader
        titulo="Roles"
        subtitulo="Roles del colegio y sus permisos"
        tabs
        {...(puedeEditar
          ? {
              accion: {
                texto: 'Nuevo rol',
                icono: 'add',
                onClick: () => router.push('/dashboard/personas/roles/nuevo'),
              },
            }
          : {})}
      />

      <p className="per-nota">
        Cada persona tiene UN rol. Estos roles vienen por defecto y se pueden editar, duplicar o
        eliminar. El alcance por sede se define al asignar el rol a la persona.
      </p>

      {isError ? (
        <ErrorBanner
          titulo="No pudimos cargar los roles"
          mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
        />
      ) : (
        <section className="per-card per-card--tabla" aria-label="Roles del colegio">
          <table className="per-tabla">
            <thead>
              <tr>
                <th scope="col">Rol</th>
                <th scope="col" className="per-col-permisos">Permisos</th>
                <th scope="col" className="per-col-personas">Personas</th>
                <th scope="col" className="per-col-origen">Origen</th>
                <th scope="col" className="per-col-accion">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="per-celda-nota">
                    Cargando roles…
                  </td>
                </tr>
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="per-celda-nota">
                    El colegio aún no tiene roles.
                  </td>
                </tr>
              ) : (
                roles.map((rol) => (
                  <tr key={rol.id}>
                    <td>
                      <div className="per-celda-doble">
                        <span className="per-celda-fuerte">{rol.nombre}</span>
                        <span className="per-celda-nota">{rol.descripcion ?? 'Sin descripción'}</span>
                      </div>
                    </td>
                    <td>{rol.permisos.length} permisos</td>
                    <td>
                      {rol.personas} {rol.personas === 1 ? 'persona' : 'personas'}
                    </td>
                    <td>
                      <span className={`per-chip per-chip--solo${rol.esPredeterminado ? '' : ' per-chip--activo'}`}>
                        {rol.esPredeterminado ? 'Predeterminado' : 'Personalizado'}
                      </span>
                    </td>
                    <td className="per-col-chevron">
                      <button
                        type="button"
                        className="per-chevron"
                        aria-label={`Editar el rol ${rol.nombre}`}
                        onClick={() => router.push(`/dashboard/personas/roles/${rol.id}`)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          chevron_right
                        </span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {data !== undefined ? (
        <div className="per-pie">
          <span>
            {roles.length} {roles.length === 1 ? 'rol' : 'roles'} · {predeterminados}{' '}
            {predeterminados === 1 ? 'predeterminado' : 'predeterminados'}
          </span>
          <button
            type="button"
            className="per-enlace"
            onClick={() => aviso('Restaurar roles por defecto: próximamente')}
          >
            Restaurar roles por defecto
          </button>
        </div>
      ) : null}
    </div>
  );
}