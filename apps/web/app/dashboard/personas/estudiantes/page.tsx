'use client';

/**
 * Personas → Estudiantes — réplica del frame «Personas · Estudiantes».
 * CURSO queda vacío hasta que exista el módulo de matrículas (la BD todavía
 * no vincula estudiante ↔ grupo); el acudiente sí es real.
 */
import { useEffect, useState } from 'react';
import { useAviso } from '@/components/DashboardShell';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PersonasHeader } from '@/components/personas/PersonasHeader';
import { useEstudiantes } from '@/hooks/usePersonas';
import { iniciales } from '@/lib/personas';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

const FILTROS: Array<{ id: FiltroEstado; texto: string }> = [
  { id: 'todos', texto: 'Todos' },
  { id: 'activos', texto: 'Activos' },
  { id: 'inactivos', texto: 'Inactivos' },
];

export default function EstudiantesPage() {
  const aviso = useAviso();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');

  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const { data, isLoading, isError, error } = useEstudiantes(busqueda);
  const items = (data?.items ?? []).filter((persona) => {
    if (filtro === 'activos') return persona.activo;
    if (filtro === 'inactivos') return !persona.activo;
    return true;
  });
  const total = data?.total ?? 0;

  return (
    <div className="per-bloque">
      <PersonasHeader
        titulo="Estudiantes"
        subtitulo={`Estudiantes matriculados · ${total} ${total === 1 ? 'estudiante' : 'estudiantes'}`}
        tabs
        accion={{
          texto: 'Nuevo estudiante',
          icono: 'person_add',
          onClick: () => aviso('Alta de estudiantes: llega con el módulo de matrículas'),
        }}
      />

      <div className="per-filtros">
        <div className="per-buscar">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            id="buscar-estudiantes"
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Buscar por nombre, documento o curso"
            aria-label="Buscar estudiantes por nombre, documento o curso"
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
          titulo="No pudimos cargar los estudiantes"
          mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
        />
      ) : (
        <section className="per-card per-card--tabla" aria-label="Estudiantes del colegio">
          <table className="per-tabla">
            <thead>
              <tr>
                <th scope="col">Estudiante</th>
                <th scope="col" className="per-col-doc">
                  Documento
                </th>
                <th scope="col" className="per-col-doc">
                  Curso
                </th>
                <th scope="col">Acudiente</th>
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
                    Cargando estudiantes…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="per-celda-nota">
                    {busqueda === ''
                      ? 'Aún no hay estudiantes matriculados.'
                      : 'No encontramos estudiantes con ese criterio.'}
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
                    <td>{persona.numeroDocumento}</td>
                    <td>{persona.curso ?? '—'}</td>
                    <td>{persona.acudiente ?? '—'}</td>
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
                        onClick={() => aviso('Ficha del estudiante: llega con matrículas')}
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
            Mostrando {items.length} de {total} {total === 1 ? 'estudiante' : 'estudiantes'}
          </span>
          <span>
            1–{items.length} de {total}
          </span>
        </div>
      ) : null}
    </div>
  );
}
