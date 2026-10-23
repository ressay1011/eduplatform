'use client';

/**
 * /dashboard/usuarios/nuevo — alta de personal del colegio.
 * La API devuelve la contraseña temporal UNA vez; aquí se muestra para
 * copiarla antes de volver a la lista.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CrearUsuarioSchema, TIPOS_DOCUMENTO, type UsuarioCreado } from '@eduplatform/types';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { PaperBg } from '@/components/PaperBg';
import { TextField } from '@/components/TextField';
import { PantallaPasswordTemporal } from '@/components/usuarios/PantallaPasswordTemporal';
import { PermisosPicker } from '@/components/usuarios/PermisosPicker';
import { useSesion } from '@/hooks/useSesion';
import { useCatalogoPermisos, useCrearUsuario } from '@/hooks/useUsuarios';
import { ApiError } from '@/lib/api';

export default function NuevoUsuarioPage() {
  const router = useRouter();
  const { data: sesion } = useSesion();
  const catalogo = useCatalogoPermisos();
  const crear = useCrearUsuario();

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<string>('CC');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<UsuarioCreado | null>(null);

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const esAdminActual = sesionColegio?.esAdmin === true;

  const puedeCrear =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('usuarios.crear'));

  /** Valida con el MISMO esquema que la API y envía. */
  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const resultado = CrearUsuarioSchema.safeParse({
      nombres,
      apellidos,
      email,
      tipoDocumento,
      numeroDocumento,
      esAdmin,
      permisos: esAdmin ? [] : permisos,
    });
    if (!resultado.success) {
      setError(resultado.error.issues[0]?.message ?? 'Revisa los datos.');
      return;
    }
    setError(null);
    crear.mutate(resultado.data, {
      onSuccess: (data) => setCreado(data),
      onError: (err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario.'),
    });
  };

  const contenido = useMemo(() => {
    if (creado !== null) {
      return (
        <PantallaPasswordTemporal
          password={creado.passwordTemporal}
          titulo="Usuario creado"
          descripcion={`Comparte esta contraseña con ${creado.usuario.nombres} ${creado.usuario.apellidos} (${creado.usuario.email}).`}
          textoBoton="Ir a la lista"
          onContinuar={() => router.push('/dashboard/usuarios')}
        />
      );
    }
    return null;
  }, [creado, router]);

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
              Nuevo usuario
            </h1>
          </div>

          {sesion === undefined ? (
            <p className="m3-body-medium">Cargando…</p>
          ) : !puedeCrear ? (
            <ErrorBanner
              tono="aviso"
              icono="lock"
              titulo="Sin acceso"
              mensaje="Necesitas el permiso usuarios.crear para crear cuentas."
            />
          ) : contenido !== null ? (
            contenido
          ) : (
            <form onSubmit={onSubmit} className="login-form" noValidate>
              {error !== null ? <ErrorBanner titulo="No se pudo crear" mensaje={error} /> : null}

              <div className="form-grid">
                <TextField
                  id="nombres"
                  label="Nombres"
                  tipo="text"
                  value={nombres}
                  onChange={setNombres}
                  autoComplete="given-name"
                />
                <TextField
                  id="apellidos"
                  label="Apellidos"
                  tipo="text"
                  value={apellidos}
                  onChange={setApellidos}
                  autoComplete="family-name"
                />
              </div>

              <TextField
                id="email"
                label="Correo institucional"
                tipo="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                ayuda="Debe pertenecer al dominio del colegio."
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

              {esAdminActual ? (
                <label className="m3-checkbox-label" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={esAdmin}
                    onChange={(e) => setEsAdmin(e.target.checked)}
                    className="visually-hidden"
                  />
                  <span className="m3-checkbox-box" aria-hidden="true">
                    <span className="material-symbols-outlined">check</span>
                  </span>
                  <span className="m3-body-medium">
                    Administrador del colegio (todos los permisos)
                  </span>
                </label>
              ) : null}

              {!esAdmin ? (
                <div>
                  <p className="m3-label-large" style={{ margin: '8px 0' }}>
                    Permisos
                  </p>
                  {catalogo.isLoading ? (
                    <p className="m3-body-small">Cargando permisos…</p>
                  ) : catalogo.data === undefined ? (
                    <p className="m3-body-small">No se pudo cargar el catálogo.</p>
                  ) : (
                    <PermisosPicker
                      catalogo={catalogo.data}
                      seleccionados={permisos}
                      onChange={setPermisos}
                      disabled={crear.isPending}
                    />
                  )}
                </div>
              ) : null}

              <div className="acciones-fila">
                <M3Button type="submit" grande disabled={crear.isPending} icono="person_add">
                  {crear.isPending ? 'Creando…' : 'Crear usuario'}
                </M3Button>
                <M3Button
                  variante="tonal"
                  type="button"
                  onClick={() => router.push('/dashboard/usuarios')}
                  disabled={crear.isPending}
                >
                  Cancelar
                </M3Button>
              </div>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
