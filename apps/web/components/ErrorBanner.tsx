/**
 * Banner de alerta M3 (error o aviso) con icono y dos líneas.
 * Los colores viven en globals.css (`.m3-banner--error` / `.m3-banner--aviso`):
 * el componente no lleva estilos inline.
 */
interface ErrorBannerProps {
  titulo: string;
  mensaje: string;
  tono?: 'error' | 'aviso';
  icono?: string;
}

export function ErrorBanner({ titulo, mensaje, tono = 'error', icono }: ErrorBannerProps) {
  const iconoNombre = icono ?? (tono === 'error' ? 'error' : 'priority_high');

  return (
    <div role="alert" className={`m3-banner m3-banner--${tono}`}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {iconoNombre}
      </span>
      <div>
        <p className="m3-title-small banner-titulo">{titulo}</p>
        <p className="m3-body-medium banner-mensaje">{mensaje}</p>
      </div>
    </div>
  );
}
