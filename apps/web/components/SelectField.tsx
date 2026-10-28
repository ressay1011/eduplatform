/** Select con la misma piel que el TextField M3 (label flotante, helper/error). */
import type { ChangeEvent } from 'react';

interface Opcion {
  valor: string;
  texto: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  opciones: readonly Opcion[];
  /** Texto de la opción vacía inicial («Elige…»). Si falta, no se muestra. */
  placeholder?: string | undefined;
  /** Mensaje de error (activa el estado de error y role=alert). */
  error?: string | null | undefined;
  ayuda?: string | undefined;
  disabled?: boolean | undefined;
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  opciones,
  placeholder,
  error = null,
  ayuda,
  disabled = false,
}: SelectFieldProps) {
  const helperId = `${id}-helper`;
  const mensaje = error ?? ayuda;

  return (
    <div className={`m3-textfield${error !== null ? ' error' : ''}`}>
      <select
        id={id}
        name={id}
        className="m3-tf m3-tf--select"
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error !== null ? true : undefined}
        aria-describedby={mensaje !== undefined ? helperId : undefined}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      <label
        htmlFor={id}
        className={`m3-tf-label m3-body-large${value === '' ? '' : ' m3-tf-label--flotante'}`}
      >
        {label}
      </label>
      <span className="material-symbols-outlined m3-tf-caret" aria-hidden="true">
        arrow_drop_down
      </span>
      {mensaje !== undefined ? (
        <p
          id={helperId}
          className="m3-tf-helper m3-body-small"
          role={error !== null ? 'alert' : undefined}
        >
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
