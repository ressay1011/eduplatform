'use client';

/**
 * Personas → Editor de rol (también crea roles nuevos).
 *
 * El rol agrupa permisos del catálogo; al guardar, la API resincroniza la
 * proyección `usuarios_permisos` de todas las personas con ese rol.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { TextField } from '@/components/TextField';
import {
  useActualizarRol,
  useCrearRol,
  useEliminarRol,
  useRoles,
} from '@/hooks/usePersonas';
import { useCatalogoPermisos } from '@/hooks/useUsuarios';
import { useSesion } from '@/hooks/useSesion';
import { agruparPermisos, nombreModulo } from '@/lib/personas';
import type { TipoPersonaRol } from '@eduplatform/types';

const TIPOS: Array<{ valor: TipoPersonaRol; texto: string }> = [
  { valor: 'EMPLEADO', texto: 'Empleado (pestaña Empleados)' },
  { valor: 'ESTUDIANTE', texto: 'Estudiante (pestaña Estudiantes)' },
  { valor: 'ACUDIENTE', texto: 'Acudiente (pestaña Acudientes)' },
];

export default function EditorRolPage() {
  const router = useRouter();
  const parametros = useParams<{ id: string }>();
  const id = parametros.id ?? '';
  const esNuevo = id === 'nuevo';

  const { data: sesion } = useSesion();
  const { data: roles, isLoading: cargandoRoles } = useRoles();
  const { data: catalogo } = useCatalogoPermisos();
  const crear = useCrearRol();
  const actualizar = useActualizarRol(esNuevo ? '' : id);
  const eliminar = useEliminarRol();

  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipoPersona, setTipoPersona] = useState<TipoPersonaRol>('EMPLEADO');
  const [activo, setActivo] = useState(true);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const rol = useMemo(
    () => (roles?.items ?? []).find((item) => item.id === id),
    [roles, id],
  );

  // Carga los valores del rol una sola vez, cuando llega de la API.
  useEffect(() => {
    if (rol === undefined) return;
    setNombre(rol.nombre);
    setDescripcion(rol.descripcion ?? '');
    setTipoPersona(rol.tipoPersona);
    setActivo(rol.activo);
    setPermisos(rol.permisos);
  }, [rol]);

  const grupos = useMemo(() => agruparPermisos(catalogo ?? []), [catalogo]);
  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeEditar =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('configuracion.editar'));

  const alternar = (codigo: string): void => {
    setPermisos((actuales) =>
      actuales.includes(codigo) ? actuales.filter((item) => item !== codigo) : [...actuales, codigo],
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
        onSuccess: () => {
          setGuardado(true);
          router.push('/dashboard/personas/roles');
        },
        onError: (fallo) => setError(fallo.message),
      });
      return;
    }
    actualizar.mutate(
      { ...dto, activo },
      {
        onSuccess: () => {
          setGuardado(true);
          router.push('/dashboard/personas/roles');
        },
        onError: (fallo) => setError(fallo.message),
      },
    );
  };

  if (!puedeEditar && sesion !== undefined) {
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

  return (
    <>
      <div className="page-topbar">
        <M3Button variante="text" icono="arrow_back" onClick={() => router.push('/dashboard/personas/roles')}>
          Roles
        </M3Button>
        <h2 className="m3-title-large" style={{ margin: 0, flex: 1 }}>
          {esNuevo ? 'Nuevo rol' : `Editar ${rol?.nombre ?? 'rol'}`}
        </h2>
        {!esNuevo && rol?.esPredeterminado === true ? (
          <span className="m3-chip small selected">
            <span className="m3-label-medium">PREDETERMINADO</span>
          </span>
        ) : null}
      </div>

      {error !== null ? <ErrorBanner titulo="No se pudo guardar" mensaje={error} /> : null}
      {guardado ? (
        <div className="aviso-inline">
          Rol guardado. Las personas con este rol ya tienen sus permisos actualizados.
        </div>
      ) : null}

      <div className="form-grid">
        <TextField
          id="rol-nombre"
          label="Nombre del rol"
          tipo="text"
          value={nombre}
          onChange={setNombre}
          autoComplete="off"
        />
        <div className="campo">
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
        <div className="ancho-total">
          <TextField
            id="rol-descripcion"
            label="Descripción (opcional)"
            tipo="text"
            value={descripcion}
            onChange={setDescripcion}
            autoComplete="off"
          />
        </div>
        {!esNuevo ? (
          <label className="radio-opcion ancho-total">
            <input
              type="checkbox"
              checked={activo}
              onChange={(evento) => setActivo(evento.target.checked)}
            />
            Rol activo (se puede asignar a nuevas personas)
          </label>
        ) : null}
      </div>

      <section className="form-seccion">
        <h3>Permisos del rol ({permisos.length})</h3>
        {grupos.length === 0 ? (
          <p className="m3-body-medium">Cargando catálogo de permisos…</p>
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.modulo} className="grupo-permisos">
              <h4>{nombreModulo(grupo.modulo)}</h4>
              <div className="permisos-lista">
                {grupo.permisos.map((permiso) => (
                  <label key={permiso.codigo} className="permiso-check">
                    <input
                      type="checkbox"
                      checked={permisos.includes(permiso.codigo)}
                      onChange={() => alternar(permiso.codigo)}
                    />
                    <span>{permiso.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <div className="form-acciones">
        <M3Button onClick={guardar} icono="save" disabled={crear.isPending || actualizar.isPending}>
          {esNuevo ? 'Crear rol' : 'Guardar cambios'}
        </M3Button>
        <M3Button variante="text" onClick={() => router.push('/dashboard/personas/roles')}>
          Cancelar
        </M3Button>
        {!esNuevo && rol !== undefined && !rol.esPredeterminado ? (
          <M3Button
            variante="text"
            icono="delete"
            onClick={() => {
              if (rol.personas > 0) {
                setError(`El rol tiene ${rol.personas} persona(s); reasígnalas antes de eliminarlo.`);
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
          </M3Button>
        ) : null}
      </div>
    </>
  );
}