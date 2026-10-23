/** Chip contextual del colegio ("Colegio detectado" / aviso). */
interface SchoolChipProps {
  visible: boolean;
  estado: 'ok' | 'warn';
  texto: string;
  inicial: string;
}

export function SchoolChip({ visible, estado, texto, inicial }: SchoolChipProps) {
  if (!visible) return null;
  return (
    <span className="school-chip" aria-live="polite" data-state={estado}>
      <span className="school-chip-avatar" aria-hidden="true">
        {inicial}
      </span>
      <span>{texto}</span>
      {estado === 'ok' ? (
        <span className="material-symbols-outlined" aria-hidden="true">
          check_circle
        </span>
      ) : null}
    </span>
  );
}