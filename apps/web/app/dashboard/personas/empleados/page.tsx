'use client';

/**
 * Personas → Empleados.
 * Personal del colegio con su rol y su alcance por sede. La edición de datos
 * vive en el detalle de usuario; aquí se listan y se crean.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { TextField } from '@/components/TextField';
import { useEmpleados } from '@/hooks/usePersonas';
import { useSesion } from '@/hooks/useSesion';
import { iniciales, textoAlcance } from '@/lib/personas';

export default function EmpleadosPage() {
  const router = useRouter();
  const { data: sesion } = useSesion();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeCrear =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('usuarios.crear'));

  const { data, isLoading, isError, error } = useEmpleados(busqueda);

  return (
    <>
      <div className="toolbar">
        <TextField
          id="buscar-empleados"
          label="Buscar por nombre, correo o documento"
          tipo="text"
          value={texto}
          onChange={setTexto}
          autoComplete="off"
        />
        {puedeCrear ? (
          <M3Button onClick={() => router.push('/dashboard/personas/empleados/nuevo')} icono="person_add">
            Nuevo empleado
          </M3Button>
        ) : null}
      </div>

      {isError ? (
        <ErrorBanner
          titulo="No pudimos cargar los empleados"
          mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
        />
      ) : isLoading ? (
        <p className="m3-body-medium">Cargando empleados…</p>
      ) : data === undefined || data.items.length === 0 ? (
        <p className="vacio m3-body-medium">
          {busqueda === ''
            ? 'Aún no hay empleados. Crea el primero con «Nuevo empleado».'
            : 'No encontramos empleados con ese criterio.'}
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Empleado</th>
              <th scope="col">Documento</th>
              <th scope="col">Rol</th>
              <th scope="col">Alcance</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((persona) => (
              <tr
                key={persona.id}
                onClick={() => router.push(`/dashboard/usuarios/${persona.id}`)}
                tabIndex={0}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') router.push(`/dashboard/usuarios/${persona.id}`);
                }}
              >
                <td>
                  <div className="celda-persona">
                    <div className="avatar-circle" aria-hidden="true">
                      {iniciales(persona.nombres, persona.apellidos)}
                    </div>
                    <div>
                      <div className="persona-nombre">
                        {persona.nombres} {persona.apellidos}
                      </div>
                      <div className="persona-detalle">{persona.email}</div>
                    </div>
                  </div>
                </td>
                <td>{persona.numeroDocumento}</td>
                <td>
                  {persona.esAdmin ? (
                    <span className="m3-chip small selected">
                      <span className="m3-label-medium">ADMIN</span>
                    </span>
                  ) : (
                    (persona.rolNombre ?? 'Sin rol')
                  )}
                </td>
                <td>{textoAlcance(persona.alcance, persona.sedes.map((sede) => sede.nombre))}</td>
                <td>
                  <span className={`m3-chip small${persona.activo ? '' : ' estado-inactivo'}`}>
                    <span className="m3-label-medium">{persona.activo ? 'ACTIVO' : 'INACTIVO'}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data !== undefined ? (
        <p className="m3-body-small" style={{ marginTop: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
          {data.total} {data.total === 1 ? 'empleado' : 'empleados'}
        </p>
      ) : null}
    </>
  );
}