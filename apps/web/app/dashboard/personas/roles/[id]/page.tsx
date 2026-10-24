'use client';

/**
 * Personas → Editor de rol — réplica del frame «Personas · Editor de rol».
 *
 * Dos tarjetas: «Datos del rol» (nombre, descripción, pestaña, disponible) y
 * «Permisos del rol» agrupados por módulo. Al guardar, la API resincroniza la
 * proyección `usuarios_permisos` de todas las personas con ese rol.
 * La misma pantalla crea roles nuevos (`/roles/nuevo`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAviso } from '@/components/DashboardShell';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PersonasHeader } from '@/components/personas/PersonasHeader';
import {
  useActualizarRol,
  useCrearRol,
  useDuplicarRol,
  useEliminarRol,
  useRoles,
} from '@/hooks/usePersonas';
import { useCatalogoPermisos } from '@/hooks/useUsuarios';
import { useSesion } from '@/hooks/useSesion';
import { agruparPermisos, nombreModulo } from '@/lib/personas';
import type { TipoPersonaRol } from '@eduplatform/types';

const TIPOS: Array<{ valor: TipoPersonaRol; texto: string }> = [
  { valor: 'EMPLEADO', texto: 'Empleados' },
  { valor: 'ESTUDIANTE', texto: 'Estudiantes' },
  { valor: 'ACUDIENTE', texto: 'Acudientes' },
];

export default function EditorRolPage() {
  const router = useRouter();
  const aviso = useAviso();
  const parametros = useParams<{ id: string }>();
  const id = parametros.id ?? '';
  const esNuevo = id === 'nuevo';

  const { data: sesion } = useSesion();
  const { data: roles, isLoading: cargandoRoles } = useRoles();
  const { data: catalogo } = useCatalogoPermisos();
  const crear = useCrearRol();
  const actualizar = useActualizarRol(esNuevo ? '' : id);
  const duplicar = useDuplicarRol();
  const eliminar = useEliminarRol();

  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipoPersona, setTipoPersona] = useState<TipoPersonaRol>('EMPLEADO');
  const [activo, setActivo] = useState(true);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const rol = useMemo(() => (roles?.items ?? []).find((item) => item.id === id), [roles, id]);

  // Carga los valores del rol una sola vez, cuando llega de la API.
  useEffect(() => {
    if (rol === undefined || cargado) return;
    setNombre(rol.nombre);
    setDescripcion(rol.descripcion ?? '');
    setTipoPersona(rol.tipoPersona);
    setActivo(rol.activo);
    setPermisos(rol.permisos);
    setCargado(true);
  }, [rol, cargado]);

  const grupos = useMemo(() => agruparPermisos(catalogo ?? []), [catalogo]);
  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeEditar =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('configuracion.editar'));

  const alternar = (codigo: string): void => {
    setPermisos((actuales) =>
      actuales.includes(codigo)
        ? actuales.filter((item) => item !== codigo)
        : [...actuales, codigo],
    );
  };

  const guardar = (): void => {
    setError(null);
    if (nombre.trim().length < 2) {
      setError('El nombre del rol necesita al menos 2 caracteres.');
      return;
    }
    const dto = { nombre: nombre.trim(), descripcion: descripcion.trim(), tipoPersona, permisos };
    if (esNuevo) {
      crear.mutate(dto, {
        onSuccess: () => router.push('/dashboard/personas/roles'),
        onError: (fallo) => setError(fallo.message),
      });
      return;
    }
    actualizar.mutate(
      { ...dto, activo },
      {
        onSuccess: () => router.push('/dashboard/personas/roles'),
        onError: (fallo) => setError(fallo.message),
      },
    );
  };

  if (sesion !== undefined && !puedeEditar) {
    return (
      <ErrorBanner
        tono="aviso"
        icono="lock"
        titulo="Sin acceso"
        mensaje="Para editar roles necesitas el permiso configuracion.editar."
      />
    );
  }

  if (!esNuevo && cargandoRoles) return <p className="m3-body-medium">Cargando rol…</p>;
  if (!esNuevo && roles !== undefined && rol === undefined) {
    return <ErrorBanner titulo="Rol no encontrado" mensaje="Puede que lo hayan eliminado." />;
  }

  const subtitulo = esNuevo
    ? 'Crea el rol y elige sus permisos'
    : `${rol?.esPredeterminado === true ? 'Rol predeterminado' : 'Rol personalizado'} · ${
        rol?.personas ?? 0
      } ${(rol?.personas ?? 0) === 1 ? 'persona' : 'personas'} · ${permisos.length} permisos`;

  const titulo = esNuevo ? 'Nuevo rol' : (rol?.nombre ?? 'Rol');

  return (
    <div className="per-bloque">
      <PersonasHeader
        titulo={titulo}
        subtitulo={subtitulo}
        volver={{ href: '/dashboard/personas/roles', texto: 'Volver a Roles' }}
      />

      {error !== null ? <p className="per-error">{error}</p> : null}

      <div className="per-form">
        <section className="per-card-form" aria-label="Datos del rol">
          <h2>Datos del rol</h2>

          <div className="per-campo">
            <label htmlFor="rol-nombre">Nombre</label>
            <input
              id="rol-nombre"
              type="text"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              autoComplete="off"
              maxLength={60}
            />
          </div>

          <div className="per-campo">
            <label htmlFor="rol-descripcion">Descripción</label>
            <input
              id="rol-descripcion"
              type="text"
              value={descripcion}
              onChange={(evento) => setDescripcion(evento.target.value)}
              autoComplete="off"
              maxLength={200}
            />
          </div>

          <div className="per-campo">
            <label htmlFor="rol-tipo">Aparece en la pestaña</label>
            <select
              id="rol-tipo"
              value={tipoPersona}
              onChange={(evento) => setTipoPersona(evento.target.value as TipoPersonaRol)}
            >
              {TIPOS.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.texto}
                </option>
              ))}
            </select>
          </div>

          <label className="per-interruptor">
            <input
              type="checkbox"
              checked={activo}
              onChange={(evento) => setActivo(evento.target.checked)}
            />
            Disponible para asignar
          </label>

          <p className="per-nota">
            El alcance (todas las sedes o una específica) se define al asignar el rol a cada
            persona, no en el rol.
          </p>

          <div className="per-acciones">
            <button
              type="button"
              className="per-btn"
              onClick={guardar}
              disabled={crear.isPending || actualizar.isPending}
            >
              {esNuevo ? 'Crear rol' : 'Guardar rol'}
            </button>
            {!esNuevo ? (
              <button
                type="button"
                className="per-btn per-btn--tonal"
                onClick={() =>
                  duplicar.mutate(id, {
                    onSuccess: () => router.push('/dashboard/personas/roles'),
                    onError: (fallo) => setError(fallo.message),
                  })
                }
                disabled={duplicar.isPending}
              >
                Duplicar
              </button>
            ) : null}
            {!esNuevo && rol !== undefined && !rol.esPredeterminado ? (
              <button
                type="button"
                className="per-btn per-btn--peligro"
                onClick={() => {
                  if (rol.personas > 0) {
                    setError(
                      `El rol tiene ${rol.personas} persona(s); reasígnalas antes de eliminarlo.`,
                    );
                    return;
                  }
                  if (!window.confirm(`¿Eliminar el rol «${rol.nombre}»?`)) return;
                  eliminar.mutate(rol.id, {
                    onSuccess: () => router.push('/dashboard/personas/roles'),
                    onError: (fallo) => setError(fallo.message),
                  });
                }}
              >
                Eliminar rol
              </button>
            ) : null}
          </div>
        </section>

        <section className="per-card-form" aria-label="Permisos del rol">
          <h2>Permisos del rol</h2>
          <p>{permisos.length} permisos seleccionados</p>

          {grupos.length === 0 ? (
            <p>Cargando catálogo de permisos…</p>
          ) : (
            <div className="per-permisos">
              {grupos.map((grupo) => (
                <div key={grupo.modulo} className="per-grupo">
                  <h3>{nombreModulo(grupo.modulo)}</h3>
                  {grupo.permisos.map((permiso) => (
                    <label key={permiso.codigo} className="per-permiso">
                      <input
                        type="checkbox"
                        checked={permisos.includes(permiso.codigo)}
                        onChange={() => alternar(permiso.codigo)}
                      />
                      {permiso.nombre}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="per-enlace"
            onClick={() => aviso('El catálogo de permisos lo administra la plataforma')}
          >
            ¿Qué hace cada permiso?
          </button>
        </section>
      </div>
    </div>
  );
}
