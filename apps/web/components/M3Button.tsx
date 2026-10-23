/** Botón M3 (filled / tonal / text / outlined) con state layer. */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'filled' | 'tonal' | 'text' | 'outlined';

interface M3ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  grande?: boolean;
  /** Nombre del ícono de Material Symbols. */
  icono?: string;
  iconoAlFinal?: boolean;
  children: ReactNode;
}

export function M3Button({
  variante = 'filled',
  grande = false,
  icono,
  iconoAlFinal = false,
  children,
  className,
  ...resto
}: M3ButtonProps) {
  const clases = ['m3-btn', `m3-btn-${variante}`, ...(grande ? ['m3-btn-large'] : []), ...(className !== undefined ? [className] : [])].join(' ');

  const iconoEl =
    icono !== undefined ? (
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20, position: 'relative' }}>
        {icono}
      </span>
    ) : null;

  return (
    <button className={clases} {...resto}>
      <span className="state-layer" />
      {iconoEl !== null && !iconoAlFinal ? iconoEl : null}
      <span className="m3-label-large" style={{ position: 'relative' }}>
        {children}
      </span>
      {iconoEl !== null && iconoAlFinal ? iconoEl : null}
    </button>
  );
}