'use client';

/**
 * Personas → Acudientes.
 * Acudiente con la lista de estudiantes a cargo (solo lectura por ahora).
 */
import { useEffect, useState } from 'react';
import { ErrorBanner } from '@/components/ErrorBanner';
import { TextField } from '@/components/TextField';
import { useAcudientes } from '@/hooks/usePersonas';
import { iniciales } from '@/lib/personas';

export default function AcudientesPage() {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const { data, isLoading, isError, error } = useAcudientes(busqueda);

  return (
    <>
      <div className="toolbar">
        <TextField
          id="buscar-acudientes"
          label="Buscar por nombre, correo o documento"
          tipo="text"
          value={texto}
          onChange={setTexto}
          autoComplete="off"
        />
      </div>

      {isError ? (
        <ErrorBanner
          titulo="No pudimos cargar los acudientes"
          mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
        />
      ) : isLoading ? (
        <p className="m3-body-medium">Cargando acudientes…</p>
      ) : data === undefined || data.items.length === 0 ? (
        <p className="vacio m3-body-medium">
          {busqueda === ''
            ? 'Todavía no hay acudientes vinculados. Se crean desde la ficha del estudiante.'
            : 'No encontramos acudientes con ese criterio.'}
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Acudiente</th>
              <th scope="col">Documento</th>
              <th scope="col">Estudiantes a cargo</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((acudiente) => (
              <tr key={acudiente.id}>
                <td>
                  <div className="celda-persona">
                    <div className="avatar-circle" aria-hidden="true">
                      {iniciales(acudiente.nombres, acudiente.apellidos)}
                    </div>
                    <div>
                      <div className="persona-nombre">
                        {acudiente.nombres} {acudiente.apellidos}
                      </div>
                      <div className="persona-detalle">{acudiente.email}</div>
                    </div>
                  </div>
                </td>
                <td>{acudiente.numeroDocumento}</td>
                <td>{acudiente.estudiantes.length === 0 ? '—' : acudiente.estudiantes.join(' · ')}</td>
                <td>
                  <span className={`m3-chip small${acudiente.activo ? '' : ' estado-inactivo'}`}>
                    <span className="m3-label-medium">{acudiente.activo ? 'ACTIVO' : 'INACTIVO'}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data !== undefined ? (
        <p className="m3-body-small" style={{ marginTop: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
          {data.total} {data.total === 1 ? 'acudiente' : 'acudientes'}
        </p>
      ) : null}
    </>
  );
}