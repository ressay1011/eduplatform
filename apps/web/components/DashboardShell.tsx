'use client';

/**
 * Shell del dashboard — barra lateral 280 px + barra superior 72 px + contenido.
 *
 * Es la estructura del frame «02 · Dashboard» del Figma, extraída para que los
 * módulos (Personas, y los que vengan) la compartan en vez de duplicarla.
 * El Dashboard admin la usa con `seccion="inicio"`; Personas con `"personas"`.
 *
 * El aviso «próximamente» se expone por contexto (`useAviso`) para que
 * cualquier página hija lo dispare sin reimplementar el snackbar.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SESION_KEY, useSesion } from '@/hooks/useSesion';
import { cerrarSesion } from '@/lib/api';
import { inicialesDe } from '@/lib/subdominio';

interface ItemNav {
  id: string;
  icono: string;
  texto: string;
  ruta?: string;
}

const NAV: ItemNav[] = [
  { id: 'inicio', icono: 'home', texto: 'Inicio', ruta: '/dashboard' },
  { id: 'calificaciones', icono: 'grading', texto: 'Calificaciones' },
  { id: 'horarios', icono: 'calendar_month', texto: 'Horarios' },
  { id: 'personas', icono: 'groups', texto: 'Personas', ruta: '/dashboard/personas' },
  { id: 'documentos', icono: 'description', texto: 'Documentos' },
  { id: 'reportes', icono: 'insights', texto: 'Reportes' },
  { id: 'auditoria', icono: 'fact_check', texto: 'Auditoría' },
  { id: 'configuracion', icono: 'settings', texto: 'Configuración' },
];

const AvisoContext = createContext<(texto: string) => void>(() => undefined);

/** Dispara el snackbar del shell desde cualquier página hija. */
export function useAviso(): (texto: string) => void {
  return useContext(AvisoContext);
}

export interface DashboardShellProps {
  /** Ítem del menú que se pinta activo. */
  seccion: string;
  /** Texto de la barra superior: «Colegio · Personas · Empleados». */
  breadcrumb: string;
  children: React.ReactNode;
}

export function DashboardShell({ seccion, breadcrumb, children }: DashboardShellProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: sesion, isError } = useSesion();
  const [aviso, setAviso] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  // Primer login: la contraseña temporal debe cambiarse antes de seguir.
  useEffect(() => {
    if (sesion !== undefined && sesion.tipo === 'colegio' && sesion.usuario.debeCambiarPassword) {
      router.replace('/cambiar-password');
    }
  }, [sesion, router]);

  useEffect(() => {
    if (aviso === null) return;
    const temporizador = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  useEffect(() => {
    if (!menuAbierto) return;
    const alPresionar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') setMenuAbierto(false);
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [menuAbierto]);

  const onSalir = useCallback(async () => {
    setSaliendo(true);
    try {
      await cerrarSesion();
    } catch {
      // La cookie pudo haber expirado ya: igual volvemos al login.
    }
    queryClient.removeQueries({ queryKey: SESION_KEY });
    router.replace('/login');
  }, [queryClient, router]);

  const mostrarAviso = useCallback((texto: string) => setAviso(texto), []);

  const ir = (item: ItemNav): void => {
    setMenuAbierto(false);
    if (item.ruta !== undefined) {
      router.push(item.ruta);
      return;
    }
    mostrarAviso(`Módulo ${item.texto}: próximamente`);
  };

  if (sesion === undefined) {
    return (
      <div className="dash-page dash-cargando">
        <p className="m3-body-medium">Cargando tu colegio…</p>
      </div>
    );
  }

  if (sesion.tipo === 'plataforma') {
    return (
      <div className="dash-page dash-cargando">
        <div className="dash-card" style={{ maxWidth: 420 }}>
          <h1 className="m3-headline-small" style={{ margin: 0 }}>
            Hola, {sesion.plataformaUsuario.nombreCompleto}
          </h1>
          <p className="dash-detalle">
            Sesión de plataforma ({sesion.plataformaUsuario.rol}). La consola SaaS llega en otra
            iteración.
          </p>
          <button
            type="button"
            className="per-btn per-btn--tonal"
            onClick={onSalir}
            disabled={saliendo}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              logout
            </span>
            {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    );
  }

  const { usuario, colegio } = sesion;
  const primerNombre = usuario.nombres.split(' ')[0] ?? usuario.nombres;
  const apellidoInicial = usuario.apellidos.trim().charAt(0).toUpperCase();
  const nombreCorto = `${primerNombre} ${apellidoInicial}.`;
  const rolVisible = sesion.esAdmin ? 'Rector' : 'Personal del colegio';
  const anio = new Date().getFullYear();

  return (
    <div className="dash-page">
      {menuAbierto ? (
        <button
          type="button"
          className="dash-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMenuAbierto(false)}
        />
      ) : null}

      <aside className={`dash-sidebar${menuAbierto ? ' abierta' : ''}`}>
        <div className="dash-colegio">
          <div className="dash-logo" aria-hidden="true">
            {inicialesDe(colegio.nombre)}
          </div>
          <div className="dash-colegio-info">
            <p className="dash-colegio-nombre">{colegio.nombre}</p>
            <p className="dash-colegio-anio">Año lectivo {anio}</p>
          </div>
        </div>

        <nav className="dash-menu" aria-label="Menú principal">
          {NAV.map((item) => {
            const activo = item.id === seccion;
            return (
              <button
                key={item.id}
                type="button"
                className={`dash-nav-item${activo ? ' active' : ''}`}
                onClick={() => ir(item)}
                aria-current={activo ? 'page' : undefined}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {item.icono}
                </span>
                <span>{item.texto}</span>
              </button>
            );
          })}
        </nav>

        <div className="dash-espaciador" />

        <div className="dash-usuario">
          <div className="dash-avatar" aria-hidden="true">
            {inicialesDe(`${usuario.nombres} ${usuario.apellidos}`)}
          </div>
          <div className="dash-usuario-textos">
            <p>{nombreCorto}</p>
            <p>{rolVisible}</p>
          </div>
          <button
            type="button"
            className="dash-icon-btn"
            onClick={onSalir}
            disabled={saliendo}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div className="dash-topbar-izq">
            <button
              type="button"
              className="dash-icon-btn dash-menu-btn"
              aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuAbierto}
              onClick={() => setMenuAbierto((abierto) => !abierto)}
            >
              <span className="material-symbols-outlined">{menuAbierto ? 'close' : 'menu'}</span>
            </button>
            <span className="dash-breadcrumb">{breadcrumb}</span>
          </div>
          <div className="dash-topbar-acciones">
            <button
              type="button"
              className="dash-icon-btn"
              aria-label="Buscar"
              title="Buscar"
              onClick={() => mostrarAviso('Búsqueda global: próximamente')}
            >
              <span className="material-symbols-outlined">search</span>
            </button>
            <button
              type="button"
              className="dash-icon-btn"
              aria-label="Notificaciones"
              title="Notificaciones"
              onClick={() => mostrarAviso('Notificaciones: próximamente')}
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
          </div>
        </header>

        <main className="dash-content" id="contenido-principal">
          <AvisoContext.Provider value={mostrarAviso}>{children}</AvisoContext.Provider>
        </main>
      </div>

      {aviso !== null ? (
        <div className="dash-toast" role="status">
          <div className="m3-snackbar">{aviso}</div>
        </div>
      ) : null}
    </div>
  );
}
