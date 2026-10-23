/** Encabezado de marca del colegio (logo con iniciales + nombre + DANE). */
interface BrandHeaderProps {
  nombre: string;
  /** DANE del colegio; null en el login unificado (el colegio aún no se conoce). */
  codigoDane: string | null;
  iniciales: string;
}

export function BrandHeader({ nombre, codigoDane, iniciales }: BrandHeaderProps) {
  return (
    <header className="brand-header">
      <div className="brand-logo" aria-hidden="true">
        {iniciales}
      </div>
      <div>
        <h1 className="brand-name">{nombre}</h1>
        {codigoDane !== null && codigoDane !== '' ? (
          <p className="m3-body-small brand-dane">DANE {codigoDane}</p>
        ) : (
          <p className="m3-body-small brand-dane">Plataforma escolar</p>
        )}
      </div>
    </header>
  );
}