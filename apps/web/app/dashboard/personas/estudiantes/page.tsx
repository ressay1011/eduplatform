'use client';

/**
 * Personas → Estudiantes.
 * Listado de solo lectura; el alta y la matrícula llegan con su módulo.
 */
import { useEffect, useState } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { TextField } from '@/components/TextField';
import { useEstudiantes } from '@/hooks/usePersonas';
import { iniciales } from '@/lib/personas';

export default function EstudiantesPage() {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const { data, isLoading, isError, error } = useEstudiantes(busqueda);

  return (
    <>
      <div className="toolbar">
        <TextField
          id="buscar-estudiantes"
          label="Buscar por nombre, documento o matrícula"
          tipo="text"
          value={texto}
          onChange={setTexto}
          autoComplete="off"
        />
      </div>

      {isError ? (
        <ErrorBanner
          titulo="No pudimos cargar los estudiantes"
          mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
        />
      ) : isLoading ? (
        <p className="m3-body-medium">Cargando estudiantes…</p>
      ) : data === undefined || data.items.length === 0 ? (
        <p className="vacio m3-body-medium">
          {busqueda === ''
            ? 'Todavía no hay estudiantes. Se cargarán con el módulo de matrículas.'
            : 'No encontramos estudiantes con ese criterio.'}
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Estudiante</th>
              <th scope="col">Documento</th>
              <th scope="col">Matrícula</th>
              <th scope="col">Curso</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((estudiante) => (
              <tr key={estudiante.id}>
                <td>
                  <div className="celda-persona">
                    <div className="avatar-circle" aria-hidden="true">
                      {iniciales(estudiante.nombres, estudiante.apellidos)}
                    </div>
                    <div>
                      <div className="persona-nombre">
                        {estudiante.nombres} {estudiante.apellidos}
                      </div>
                      <div className="persona-detalle">{estudiante.email}</div>
                    </div>
                  </div>
                </td>
                <td>{estudiante.numeroDocumento}</td>
                <td>{estudiante.codigoMatricula}</td>
                <td>{estudiante.curso ?? '—'}</td>
                <td>
                  <span className={`m3-chip small${estudiante.activo ? '' : ' estado-inactivo'}`}>
                    <span className="m3-label-medium">{estudiante.estado}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data !== undefined ? (
        <p className="m3-body-small" style={{ marginTop: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
          {data.total} {data.total === 1 ? 'estudiante' : 'estudiantes'} · el curso se asigna en Matrículas
        </p>
      ) : null}
    </>
  );
}