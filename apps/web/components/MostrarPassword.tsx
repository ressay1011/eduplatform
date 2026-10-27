/**
 * Botón de mostrar/ocultar contraseña para el slot `trailing` del TextField.
 *
 * El ícono va con la clase `.m3-tf-trailing`, que se ancla a coordenadas del
 * input (no al wrapper) para que no se mueva cuando aparece el helper de error.
 */
interface MostrarPasswordProps {
  /** Si la contraseña se está mostrando en claro. */
  visible: boolean;
  onToggle: () => void;
  /** Sustantivo para el texto accesible («Mostrar <etiqueta>»). */
  etiqueta?: string;
}

export function MostrarPassword({
  visible,
  onToggle,
  etiqueta = 'contraseña',
}: MostrarPasswordProps) {
  return (
    <button
      type="button"
      className="m3-tf-trailing"
      aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${etiqueta}`}
      onClick={onToggle}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {visible ? 'visibility_off' : 'visibility'}
      </span>
    </button>
  );
}
