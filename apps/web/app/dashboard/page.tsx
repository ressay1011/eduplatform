'use client';

/**
 * Dashboard · Admin del colegio — réplica del diseño aprobado en Figma
 * (página «02 · Dashboard», frame 1440×900).
 *
 * Estructura: barra lateral 280 px + barra superior 72 px + contenido con
 * saludo, 4 KPI y rejilla de dos columnas (estado del período y pendientes a
 * la izquierda; actividad reciente a la derecha).
 *
 * Datos: la sesión (nombre, colegio, rol) es real; los indicadores y las
 * listas usan los valores del mock hasta que existan los módulos de
 * matrícula/calificaciones/auditoría. Los accesos a módulos no construidos
 * muestran un aviso «próximamente».
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { M3Button } from '@/components/M3Button';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { SESION_KEY, useSesion } from '@/hooks/useSesion';
import { cerrarSesion } from '@/lib/api';
import { inicialesDe } from '@/lib/subdominio';
import { inicialesVisible, nombreCorto } from '@/lib/nombre';

/** Saludo según la hora local (el diseño dice «Buenos días»). */
function saludoDe(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

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

const KPIS = [
  { etiqueta: 'MATRÍCULA TOTAL', valor: '412', pie: '▲ 12 vs 2025', positivo: true },
  { etiqueta: 'DOCENTES', valor: '28', pie: '2 nuevos este año', positivo: false },
  { etiqueta: 'GRUPOS', valor: '16', pie: 'preescolar a media', positivo: false },
  { etiqueta: 'ASISTENCIA HOY', valor: '94%', pie: '▲ 1,2 vs ayer', positivo: true },
] as const;

const ACTIVIDAD = [
  {
    titulo: 'Certificado emitido',
    detalle: 'Constancia de estudio · Juan Pérez · hace 2 h',
  },
  {
    titulo: 'Matrícula registrada',
    detalle: 'Ana María Gómez · 6°A · ayer',
  },
  {
    titulo: 'Cierre de período programado',
    detalle: 'Período 1 · 30 de abril · 03 abr',
  },
] as const;

const PENDIENTES = [
  {
    icono: 'assignment',
    titulo: '3 cargas sin cerrar planilla',
    detalle: 'Matemáticas 6A · Inglés 8B · Sociales 10A',
    ruta: null,
  },
  {
    icono: 'description',
    titulo: '12 certificados por emitir',
    detalle: 'Solicitudes pendientes de secretaría',
    ruta: null,
  },
  {
    icono: 'person',
    titulo: '2 usuarios por activar',
    detalle: 'Invitaciones creadas por rectoría',
    ruta: '/dashboard/usuarios',
  },
] as const;

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: sesion } = useSesion();
  const [aviso, setAviso] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  /** Drawer de navegación en móvil/tablet (<1024 px). */
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Sesión, contraseña temporal y onboarding pendiente los resuelve
  // `app/dashboard/layout.tsx` (GuardiaAcceso).

  // El aviso «próximamente» se oculta solo.
  useEffect(() => {
    if (aviso === null) return;
    const temporizador = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  // Cerrar el drawer con Escape (teclado).
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
          <M3Button variante="tonal" onClick={onSalir} disabled={saliendo} icono="logout">
            {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
          </M3Button>
        </div>
      </div>
    );
  }

  const { usuario, colegio } = sesion;
  const saludo = nombreCorto(usuario);
  const rolVisible = sesion.esAdmin ? 'Rector' : 'Personal del colegio';
  const anio = new Date().getFullYear();

  const ir = (item: ItemNav): void => {
    setMenuAbierto(false);
    if (item.ruta !== undefined) {
      router.push(item.ruta);
      return;
    }
    setAviso(`Módulo ${item.texto}: próximamente`);
  };

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
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dash-nav-item${item.id === 'inicio' ? ' active' : ''}`}
              onClick={() => ir(item)}
              aria-current={item.id === 'inicio' ? 'page' : undefined}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icono}
              </span>
              <span>{item.texto}</span>
            </button>
          ))}
        </nav>

        <div className="dash-espaciador" />

        <div className="dash-usuario">
          <div className="dash-avatar" aria-hidden="true">
            {inicialesVisible(usuario)}
          </div>
          <div className="dash-usuario-textos">
            <p>{saludo}</p>
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
            <span className="dash-breadcrumb">
              {colegio.nombre} · Período 1 · Año {anio}
            </span>
          </div>
          <div className="dash-topbar-acciones">
            <button
              type="button"
              className="dash-icon-btn"
              aria-label="Buscar"
              title="Buscar"
              onClick={() => setAviso('Búsqueda global: próximamente')}
            >
              <span className="material-symbols-outlined">search</span>
            </button>
            <button
              type="button"
              className="dash-icon-btn"
              aria-label="Notificaciones"
              title="Notificaciones"
              onClick={() => setAviso('Notificaciones: próximamente')}
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
          </div>
        </header>

        <main className="dash-content" id="contenido-principal">
          <section className="dash-saludo">
            <h1>
              {saludoDe(new Date().getHours())}, {saludo}
            </h1>
            <p>Resumen institucional · Período 1 (en curso) · cierre el 30 de abril</p>
          </section>

          <OnboardingChecklist />

          <section className="dash-kpis" aria-label="Indicadores">
            {KPIS.map((kpi) => (
              <article key={kpi.etiqueta} className="dash-kpi">
                <p className="dash-kpi-label">{kpi.etiqueta}</p>
                <p className="dash-kpi-valor">{kpi.valor}</p>
                <p className={`dash-kpi-pie${kpi.positivo ? ' pos' : ''}`}>{kpi.pie}</p>
              </article>
            ))}
          </section>

          <div className="dash-grid">
            <div className="dash-col">
              <article className="dash-card">
                <div className="dash-fila-titulo">
                  <h2>Estado del período</h2>
                  <span className="dash-chip">
                    EN CURSO
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                      style={{ fontSize: 18 }}
                    >
                      check
                    </span>
                  </span>
                </div>
                <div
                  className="dash-progreso"
                  role="progressbar"
                  aria-valuenow={78}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Planillas con notas registradas"
                >
                  <span style={{ width: '78%' }} />
                </div>
                <p className="dash-detalle">
                  78% de planillas con notas registradas · cierre programado el 30 de abril.
                </p>
                <button
                  type="button"
                  className="dash-btn-tonal"
                  onClick={() => setAviso('Calificaciones: próximamente')}
                >
                  Ver notas faltantes
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ fontSize: 18 }}
                  >
                    arrow_forward
                  </span>
                </button>
              </article>

              <article className="dash-card">
                <h2>Pendientes</h2>
                <div className="dash-lista">
                  {PENDIENTES.map((item, indice) => (
                    <div key={item.titulo}>
                      {indice > 0 ? <div className="dash-divisor" /> : null}
                      <button
                        type="button"
                        className="dash-fila"
                        onClick={() => {
                          if (item.ruta !== null) router.push(item.ruta);
                          else setAviso(`${item.titulo}: próximamente`);
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {item.icono}
                        </span>
                        <span className="dash-fila-textos">
                          <span className="dash-fila-titulo-item">{item.titulo}</span>
                          <span className="dash-fila-detalle">{item.detalle}</span>
                        </span>
                        <span
                          className="material-symbols-outlined dash-fila-chevron"
                          aria-hidden="true"
                        >
                          chevron_right
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="dash-col dash-col-derecha">
              <article className="dash-card">
                <h2>Actividad reciente</h2>
                <div className="dash-lista dash-actividad">
                  {ACTIVIDAD.map((fila, indice) => (
                    <div key={fila.titulo}>
                      {indice > 0 ? <div className="dash-divisor" /> : null}
                      <div className="dash-fila" style={{ padding: '8px 0' }}>
                        <span className="dash-fila-textos">
                          <span className="dash-fila-titulo-item">{fila.titulo}</span>
                          <span className="dash-fila-detalle">{fila.detalle}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="dash-btn-texto"
                  onClick={() => setAviso('Auditoría: próximamente')}
                >
                  Ver auditoría
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ fontSize: 18 }}
                  >
                    arrow_forward
                  </span>
                </button>
              </article>
            </div>
          </div>
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
