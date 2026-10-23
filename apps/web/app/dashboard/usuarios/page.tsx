'use client';

/**
 * /dashboard/usuarios — Personas → Usuarios.
 * Lista con búsqueda (nombre/correo/documento) y filtro por estado.
 * Solo visible para el admin del colegio o quien tenga `usuarios.ver`.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { PaperBg } from '@/components/PaperBg';
import { TextField } from '@/components/TextField';
import { useSesion } from '@/hooks/useSesion';
import { useUsuarios } from '@/hooks/useUsuarios';
import { inicialesDe } from '@/lib/subdominio';

type FiltroEstado = 'todos' | 'activo' | 'inactivo';

const FILTROS: Array<{ valor: FiltroEstado; texto: string }> = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'activo', texto: 'Activos' },
  { valor: 'inactivo', texto: 'Inactivos' },
];

export default function UsuariosPage() {
  const router = useRouter();
  const { data: sesion, isError: errorSesion } = useSesion();

  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');

  // Debounce de 300 ms: no dispara una consulta por tecla.
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  useEffect(() => {
    if (errorSesion) router.replace('/login');
  }, [errorSesion, router]);

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;
  const puedeVer =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('usuarios.ver'));
  const puedeCrear =
    sesionColegio !== null &&
    (sesionColegio.esAdmin || sesionColegio.permisos.includes('usuarios.crear'));

  const { data, isLoading, isError, error } = useUsuarios(busqueda, estado, puedeVer);

  if (sesion !== undefined && sesion.tipo !== 'colegio') {
    // Los usuarios de plataforma no gestionan personal desde aquí.
    return (
      <>
        <PaperBg />
        <main className="stage" id="contenido-principal">
          <div className="stage-card dashboard-card fade">
            <ErrorBanner
              tono="aviso"
              icono="info"
              titulo="Módulo del colegio"
              mensaje="Esta sección es para el personal de un colegio."
            />
            <M3Button variante="tonal" onClick={() => router.replace('/dashboard')} icono="arrow_back">
              Volver al inicio
            </M3Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PaperBg />
      <main className="stage" id="contenido-principal">
        <div className="stage-card page-card fade">
          <div className="page-topbar">
            <M3Button variante="text" onClick={() => router.push('/dashboard')} icono="arrow_back" type="button">
              Inicio
            </M3Button>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 className="m3-headline-small" style={{ margin: 0 }}>
                Usuarios
              </h1>
              <p
                className="m3-body-small page-subtitulo"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                {sesionColegio?.colegio.nombre ?? 'Personal del colegio'}
              </p>
            </div>
            {puedeCrear ? (
              <M3Button onClick={() => router.push('/dashboard/usuarios/nuevo')} icono="person_add">
                Nuevo usuario
              </M3Button>
            ) : null}
          </div>

          {sesion === undefined ? (
            <p className="m3-body-medium">Cargando…</p>
          ) : !puedeVer ? (
            <ErrorBanner
              tono="aviso"
              icono="lock"
              titulo="Sin acceso"
              mensaje="No tienes el permiso usuarios.ver. Pídeselo al administrador del colegio."
            />
          ) : (
            <>
              <div className="toolbar">
                <TextField
                  id="buscar-usuarios"
                  label="Buscar por nombre, correo o documento"
                  tipo="text"
                  value={texto}
                  onChange={setTexto}
                  autoComplete="off"
                />
                <div className="chips-filtro" role="group" aria-label="Filtrar por estado">
                  {FILTROS.map((filtro) => (
                    <button
                      key={filtro.valor}
                      type="button"
                      className={`m3-chip${estado === filtro.valor ? ' selected' : ''}`}
                      onClick={() => setEstado(filtro.valor)}
                      aria-pressed={estado === filtro.valor}
                    >
                      <span className="m3-label-large">{filtro.texto}</span>
                    </button>
                  ))}
                </div>
              </div>

              {isError ? (
                <ErrorBanner
                  titulo="No pudimos cargar los usuarios"
                  mensaje={error instanceof Error ? error.message : 'Intenta de nuevo.'}
                />
              ) : isLoading ? (
                <p className="m3-body-medium">Cargando usuarios…</p>
              ) : data === undefined || data.items.length === 0 ? (
                <p className="vacio m3-body-medium">
                  {busqueda === '' && estado === 'todos'
                    ? 'Aún no hay usuarios. Crea el primero con «Nuevo usuario».'
                    : 'No encontramos usuarios con ese criterio.'}
                </p>
              ) : (
                <div className="usuarios-lista">
                  {data.items.map((usuario) => (
                    <button
                      key={usuario.id}
                      type="button"
                      className="usuario-row"
                      onClick={() => router.push(`/dashboard/usuarios/${usuario.id}`)}
                    >
                      <div className="avatar-circle" aria-hidden="true">
                        {inicialesDe(`${usuario.nombres} ${usuario.apellidos}`)}
                      </div>
                      <div className="usuario-info">
                        <p className="m3-title-small" style={{ margin: 0 }}>
                          {usuario.nombres} {usuario.apellidos}
                        </p>
                        <p
                          className="m3-body-small usuario-email"
                          style={{ margin: 0, color: 'var(--md-sys-color-on-surface-variant)' }}
                        >
                          {usuario.email}
                        </p>
                        <div className="usuario-chips">
                          {usuario.esAdmin ? (
                            <span className="m3-chip small selected">
                              <span className="m3-label-medium">ADMIN</span>
                            </span>
                          ) : (
                            usuario.permisos.slice(0, 3).map((permiso) => (
                              <span key={permiso} className="m3-chip small">
                                <span className="m3-label-medium">{permiso}</span>
                              </span>
                            ))
                          )}
                          {!usuario.esAdmin && usuario.permisos.length > 3 ? (
                            <span className="m3-chip small">
                              <span className="m3-label-medium">+{usuario.permisos.length - 3}</span>
                            </span>
                          ) : null}
                          {usuario.debeCambiarPassword ? (
                            <span className="m3-chip small">
                              <span className="m3-label-medium">clave temporal</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={`m3-chip small${usuario.activo ? '' : ' estado-inactivo'}`}
                      >
                        <span className="m3-label-medium">
                          {usuario.activo ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {data !== undefined ? (
                <p
                  className="m3-body-small"
                  style={{ marginTop: 12, color: 'var(--md-sys-color-on-surface-variant)' }}
                >
                  {data.total} {data.total === 1 ? 'usuario' : 'usuarios'}
                </p>
              ) : null}
            </>
          )}
        </div>
      </main>
    </>
  );
}