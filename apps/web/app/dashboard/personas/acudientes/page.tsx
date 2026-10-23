'use client';

/**
 * Personas → Acudientes — réplica del frame «Personas · Acudientes».
 * CONTACTO usa el teléfono declarado en el vínculo con el estudiante; si no
 * hay teléfono, cae al correo (el esquema de usuarios no guarda celular).
 */
import { useEffect, useState } from 'react';
import { useAviso } from '@/components/DashboardShell';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PersonasHeader } from '@/components/personas/PersonasHeader';
import { useAcudientes } from '@/hooks/usePersonas';
import { iniciales } from '@/lib/personas';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

const FILTROS: Array<{ id: FiltroEstado; texto: string }> = [
  { id: 'todos', texto: 'Todos' },
  { id: 'activos', texto: 'Activos' },
  { id: 'inactivos', texto: 'Inactivos' },
];

export default function AcudientesPage() {
  const aviso = useAviso();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');

  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const { data, isLoading, isError, error } = useAcudientes(busqueda);
  const items = (data?.items ?? []).filter((persona) => {
    if (filtro === 'activos') return persona.activo;
    if (filtro === 'inactivos') return !persona.activo;
    return true;
  });
  const total = data?.total ?? 0;

  return (
    <div className="per-bloque">
      <PersonasHeader
        titulo="Acudientes"
        subtitulo={`Acudientes vinculados · ${total} ${total === 1 ? 'acudiente' : 'acudientes'}`}
        tabs
        accion={{
          texto: 'Nuevo acudiente',
          icono: 'person_add',
          onClick: () => aviso('Alta de acudientes: llega con el módulo de matrículas'),
        }}
      />

      <div className="per-filtros">
        <div className="per-buscar">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            id="buscar-acudientes"
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Buscar por nombre, correo o estudiante"
            aria-label="Buscar acudientes por nombre, correo o estudiante"
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
          titulo="No pudimos cargar los acudientes"
          mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
        />
      ) : (
        <section className="per-card per-card--tabla" aria-label="Acudientes del colegio">
          <table className="per-tabla">
            <thead>
              <tr>
                <th scope="col">Acudiente</th>
                <th scope="col" className="per-col-doc">Documento</th>
                <th scope="col">Contacto</th>
                <th scope="col">A cargo</th>
                <th scope="col" className="per-col-estado">Estado</th>
                <th scope="col" className="per-col-accion">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="per-celda-nota">
                    Cargando acudientes…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="per-celda-nota">
                    {busqueda === ''
                      ? 'Aún no hay acudientes vinculados.'
                      : 'No encontramos acudientes con ese criterio.'}
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
                    <td>CC {persona.numeroDocumento}</td>
                    <td>{persona.telefono ?? persona.email}</td>
                    <td>{persona.estudiantes.length === 0 ? '—' : persona.estudiantes.join(' · ')}</td>
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
                        onClick={() => aviso('Ficha del acudiente: llega con matrículas')}
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
            Mostrando {items.length} de {total} {total === 1 ? 'acudiente' : 'acudientes'}
          </span>
          <span>
            1–{items.length} de {total}
          </span>
        </div>
      ) : null}
    </div>
  );
}