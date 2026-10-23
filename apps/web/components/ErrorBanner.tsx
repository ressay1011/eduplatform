/** Banner de alerta M3 (error o aviso) con icono y dos líneas. */
interface ErrorBannerProps {
  titulo: string;
  mensaje: string;
  tono?: 'error' | 'aviso';
  icono?: string;
}

export function ErrorBanner({ titulo, mensaje, tono = 'error', icono }: ErrorBannerProps) {
  const estilo =
    tono === 'error'
      ? { background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-error)' }
      : {
          background: 'var(--md-sys-color-tertiary-container)',
          color: 'var(--md-sys-color-on-tertiary-container)',
        };
  const iconoNombre = icono ?? (tono === 'error' ? 'error' : 'priority_high');

  return (
    <div role="alert" className="m3-banner" style={estilo}>
      <span className="material-symbols-outlined" aria-hidden="true" style={{ color: estilo.color }}>
        {iconoNombre}
      </span>
      <div>
        <p className="m3-title-small banner-titulo">{titulo}</p>
        <p className="m3-body-medium banner-mensaje">{mensaje}</p>
      </div>
    </div>
  );
}