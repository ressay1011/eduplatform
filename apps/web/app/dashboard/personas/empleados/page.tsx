'use client';

/**
 * Personas → Empleados — réplica del frame «Personas · Empleados».
 *
 * Encabezado (28 Fraunces + acción primaria), pestañas en chips, buscador de
 * 50 px con chips de estado y tarjeta de tabla con avatar de 36 px. Las filas
 * muestran el rol y el alcance reales de cada cuenta.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PersonasHeader } from '@/components/personas/PersonasHeader';
import { useEmpleados } from '@/hooks/usePersonas';
import { useSesion } from '@/hooks/useSesion';
import { iniciales, textoAlcance } from '@/lib/personas';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

const FILTROS: Array<{ id: FiltroEstado; texto: string }> = [
  { id: 'todos', texto: 'Todos' },
  { id: 'activos', texto: 'Activos' },
  { id: 'inactivos', texto: 'Inactivos' },
];

export default function EmpleadosPage() {
  const router = useRouter();
  const { data: sesion } = useSesion();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');

  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeCrear =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('usuarios.crear'));

  const { data, isLoading, isError, error } = useEmpleados(busqueda);
  const items = (data?.items ?? []).filter((persona) => {
    if (filtro === 'activos') return persona.activo;
    if (filtro === 'inactivos') return !persona.activo;
    return true;
  });
  const total = data?.total ?? 0;

  return (
    <div className="per-bloque">
      <PersonasHeader
        titulo="Empleados"
        subtitulo={`Personal del colegio · ${total} ${total === 1 ? 'empleado' : 'empleados'}`}
        tabs
        {...(puedeCrear
          ? {
              accion: {
                texto: 'Nuevo empleado',
                icono: 'person_add',
                onClick: () => router.push('/dashboard/personas/empleados/nuevo'),
              },
            }
          : {})}
      />

      <div className="per-filtros">
        <div className="per-buscar">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            id="buscar-empleados"
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Buscar por nombre, correo o documento"
            aria-label="Buscar empleados por nombre, correo o documento"
            autoComplete="off"
          />
        </div>
        <div className="per-estados" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              className={`per-chip${filtro === opcion.id ? ' per-chip--activo' : ''}`}
              aria-pressed={filtro === opcion.id}
              onClick={() => setFiltro(opcion.id)}
            >
              {opcion.texto}
              {filtro === opcion.id ? (
                <span className="material-symbols-outlined" aria-hidden="true">
                  check
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <ErrorBanner
          titulo="No pudimos cargar los empleados"
          mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
        />
      ) : (
        <section className="per-card per-card--tabla" aria-label="Empleados del colegio">
          <table className="per-tabla">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col" className="per-col-doc">
                  Documento
                </th>
                <th scope="col" className="per-col-rol">
                  Rol
                </th>
                <th scope="col">Sede</th>
                <th scope="col" className="per-col-estado">
                  Estado
                </th>
                <th scope="col" className="per-col-accion">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="per-celda-nota">
                    Cargando empleados…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="per-celda-nota">
                    {busqueda === ''
                      ? 'Aún no hay empleados. Crea el primero con «Nuevo empleado».'
                      : 'No encontramos empleados con ese criterio.'}
                  </td>
                </tr>
              ) : (
                items.map((persona) => (
                  <tr key={persona.id}>
                    <td>
                      <div className="per-persona">
                        <div className="per-avatar" aria-hidden="true">
                          {iniciales(persona.nombres, persona.apellidos)}
                        </div>
                        <div className="per-persona-textos">
                          <span className="per-persona-nombre">
                            {persona.nombres} {persona.apellidos}
                          </span>
                          <span className="per-persona-detalle">{persona.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {persona.tipoDocumento} {persona.numeroDocumento}
                    </td>
                    <td>
                      <span
                        className={`per-chip per-chip--solo${persona.esAdmin ? ' per-chip--activo' : ''}`}
                      >
                        {persona.esAdmin ? 'ADMIN' : (persona.rolNombre ?? 'Sin rol')}
                      </span>
                    </td>
                    <td>
                      {textoAlcance(
                        persona.alcance,
                        persona.sedes.map((sede) => sede.nombre),
                      )}
                    </td>
                    <td>
                      <span className="per-chip per-chip--solo">
                        {persona.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="per-col-chevron">
                      <button
                        type="button"
                        className="per-chevron"
                        aria-label={`Ver ficha de ${persona.nombres} ${persona.apellidos}`}
                        onClick={() => router.push(`/dashboard/usuarios/${persona.id}`)}
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
            Mostrando {items.length} de {total} {total === 1 ? 'empleado' : 'empleados'}
          </span>
          <span>
            1–{items.length} de {total}
          </span>
        </div>
      ) : null}
    </div>
  );
}
