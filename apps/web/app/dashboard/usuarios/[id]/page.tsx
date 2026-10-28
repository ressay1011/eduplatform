'use client';

/**
 * /dashboard/usuarios/[id] — detalle y edición de un usuario.
 * Guarda datos (PATCH) y permisos (PUT) juntos; permite resetear la
 * contraseña (la API revoca sus sesiones y devuelve una temporal).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ActualizarUsuarioSchema, TIPOS_DOCUMENTO } from '@eduplatform/types';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { PaperBg } from '@/components/PaperBg';
import { TextField } from '@/components/TextField';
import { PantallaPasswordTemporal } from '@/components/usuarios/PantallaPasswordTemporal';
import { PermisosPicker } from '@/components/usuarios/PermisosPicker';
import { useSesion } from '@/hooks/useSesion';
import {
  useActualizarUsuario,
  useCatalogoPermisos,
  useEstablecerPermisos,
  useResetearPassword,
  useUsuario,
} from '@/hooks/useUsuarios';
import { ApiError } from '@/lib/api';

export default function EditarUsuarioPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const { data: sesion } = useSesion();
  const { data: usuario, isLoading, isError, error } = useUsuario(id);
  const catalogo = useCatalogoPermisos();
  const actualizar = useActualizarUsuario(id);
  const guardarPermisos = useEstablecerPermisos(id);
  const reset = useResetearPassword(id);

  const [inicializado, setInicializado] = useState(false);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<string>('CC');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [activo, setActivo] = useState(true);
  const [permisos, setPermisos] = useState<string[]>([]);

  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  useEffect(() => {
    if (usuario === undefined || inicializado) return;
    setNombres(usuario.nombres);
    setApellidos(usuario.apellidos);
    setNombreUsuario(usuario.usuario);
    setTipoDocumento(usuario.tipoDocumento);
    setNumeroDocumento(usuario.numeroDocumento);
    setActivo(usuario.activo);
    setPermisos(usuario.permisos);
    setInicializado(true);
  }, [usuario, inicializado]);

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeEditar =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('usuarios.editar'));

  const esAdminObjetivo = usuario?.esAdmin === true;
  const esMismaCuenta = usuario !== undefined && sesionColegio?.usuario.id === usuario.id;

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setMensaje(null);
    setErrorForm(null);
    const validado = ActualizarUsuarioSchema.safeParse({
      nombres,
      apellidos,
      usuario: nombreUsuario,
      tipoDocumento,
      numeroDocumento,
      activo,
    });
    if (!validado.success) {
      setErrorForm(validado.error.issues[0]?.message ?? 'Revisa los datos.');
      return;
    }
    try {
      await actualizar.mutateAsync(validado.data);
      if (!esAdminObjetivo) {
        await guardarPermisos.mutateAsync(permisos);
      }
      setMensaje('Cambios guardados.');
    } catch (err) {
      setErrorForm(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    }
  };

  const onReset = async (): Promise<void> => {
    if (
      !window.confirm(
        'Se generará una contraseña temporal y se cerrarán todas sus sesiones. ¿Continuar?',
      )
    ) {
      return;
    }
    setMensaje(null);
    setErrorForm(null);
    try {
      await reset.mutateAsync();
    } catch (err) {
      setErrorForm(err instanceof ApiError ? err.message : 'No se pudo restablecer.');
    }
  };

  const guardando = actualizar.isPending || guardarPermisos.isPending;

  return (
    <>
      <PaperBg />
      <main className="stage" id="contenido-principal">
        <div className="stage-card page-card fade">
          <div className="page-topbar">
            <M3Button
              variante="text"
              onClick={() => router.push('/dashboard/usuarios')}
              icono="arrow_back"
              type="button"
            >
              Usuarios
            </M3Button>
            <h1 className="m3-headline-small" style={{ margin: 0 }}>
              {usuario === undefined ? 'Usuario' : `${usuario.nombres} ${usuario.apellidos}`}
            </h1>
          </div>

          {isLoading ? (
            <p className="m3-body-medium">Cargando usuario…</p>
          ) : isError || usuario === undefined ? (
            <ErrorBanner
              titulo="No pudimos cargar el usuario"
              mensaje={
                error instanceof Error ? error.message : 'Verifica el enlace e intenta de nuevo.'
              }
            />
          ) : !puedeEditar ? (
            <ErrorBanner
              tono="aviso"
              icono="lock"
              titulo="Solo lectura"
              mensaje="No tienes el permiso usuarios.editar; puedes ver los datos pero no modificarlos."
            />
          ) : (
            <>
              {mensaje !== null ? (
                <p className="aviso-guardado" role="status">
                  {mensaje}
                </p>
              ) : null}
              {errorForm !== null ? (
                <ErrorBanner titulo="No se pudo guardar" mensaje={errorForm} />
              ) : null}

              {reset.data !== undefined ? (
                <PantallaPasswordTemporal
                  password={reset.data.passwordTemporal}
                  titulo="Contraseña restablecida"
                  descripcion={`Comparte esta contraseña con ${usuario.nombres} ${usuario.apellidos}. Sus sesiones anteriores fueron cerradas.`}
                  textoBoton="Entendido"
                  onContinuar={() => reset.reset()}
                />
              ) : null}

              <form onSubmit={(e) => void onSubmit(e)} className="login-form" noValidate>
                <div className="form-grid">
                  <TextField
                    id="nombres"
                    label="Nombres"
                    tipo="text"
                    value={nombres}
                    onChange={setNombres}
                  />
                  <TextField
                    id="apellidos"
                    label="Apellidos"
                    tipo="text"
                    value={apellidos}
                    onChange={setApellidos}
                  />
                </div>

                <TextField
                  id="usuario"
                  label="Nombre de usuario"
                  tipo="text"
                  value={nombreUsuario}
                  onChange={setNombreUsuario}
                />

                <div className="form-grid">
                  <div>
                    <label className="m3-select-label" htmlFor="tipo-documento">
                      Tipo de documento
                    </label>
                    <select
                      id="tipo-documento"
                      className="m3-select"
                      value={tipoDocumento}
                      onChange={(e) => setTipoDocumento(e.target.value)}
                    >
                      {TIPOS_DOCUMENTO.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {tipo}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TextField
                    id="numero-documento"
                    label="Número de documento"
                    tipo="text"
                    value={numeroDocumento}
                    onChange={setNumeroDocumento}
                  />
                </div>

                <label className="m3-checkbox-label" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    className="visually-hidden"
                    disabled={esMismaCuenta}
                  />
                  <span className="m3-checkbox-box" aria-hidden="true">
                    <span className="material-symbols-outlined">check</span>
                  </span>
                  <span className="m3-body-medium">
                    Cuenta activa{esMismaCuenta ? ' (no puedes desactivar tu propia cuenta)' : ''}
                  </span>
                </label>

                {esAdminObjetivo ? (
                  <div className="note-box">
                    <p className="m3-body-medium" style={{ margin: 0 }}>
                      <strong>Administrador del colegio:</strong> tiene todos los permisos por ser
                      el admin. No requiere asignación individual.
                    </p>
                  </div>
                ) : usuario?.rolId != null ? (
                  <div className="note-box">
                    <p className="m3-body-medium" style={{ margin: 0 }}>
                      <strong>Rol: {usuario.rolNombre ?? 'sin nombre'}.</strong> Los permisos se
                      editan en <em>Personas → Roles</em>; esta persona los hereda del rol.
                    </p>
                  </div>
                ) : sesionColegio?.esAdmin ? (
                  <div>
                    <p className="m3-label-large" style={{ margin: '8px 0' }}>
                      Permisos
                    </p>
                    {catalogo.data === undefined ? (
                      <p className="m3-body-small">Cargando catálogo…</p>
                    ) : (
                      <PermisosPicker
                        catalogo={catalogo.data}
                        seleccionados={permisos}
                        onChange={setPermisos}
                        disabled={guardando}
                      />
                    )}
                  </div>
                ) : (
                  <div className="note-box">
                    <p className="m3-body-medium" style={{ margin: 0 }}>
                      Esta cuenta todavía no tiene rol. Solo el administrador del colegio puede
                      asignar permisos individuales.
                    </p>
                  </div>
                )}

                <div className="acciones-fila">
                  <M3Button type="submit" grande disabled={guardando} icono="save">
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </M3Button>
                  {!esAdminObjetivo || sesionColegio?.esAdmin ? (
                    <M3Button
                      variante="tonal"
                      type="button"
                      onClick={() => void onReset()}
                      disabled={reset.isPending}
                      icono="lock_reset"
                    >
                      {reset.isPending ? 'Generando…' : 'Restablecer contraseña'}
                    </M3Button>
                  ) : null}
                </div>
              </form>

              <p
                className="m3-body-small"
                style={{ marginTop: 16, color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                Último acceso:{' '}
                {usuario.ultimoAcceso === null
                  ? 'nunca'
                  : new Date(usuario.ultimoAcceso).toLocaleString('es-CO')}
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
