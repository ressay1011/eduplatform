/** Campo de texto M3 (outlined, label flotante, helper/error accesible). */
import { useEffect, useRef, type ReactNode } from 'react';

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  tipo?: 'text' | 'email' | 'password';
  autoComplete?: string;
  /** Mensaje de error (activa el estado de error y role=alert). */
  error?: string | null;
  /** Texto de ayuda permanente (se ignora si hay error). */
  ayuda?: string;
  /** Contenido flotante a la derecha (p. ej. botón mostrar/ocultar). */
  trailing?: ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Se dispara al perder el foco (p. ej. detección del dominio del correo). */
  onBlur?: () => void;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  tipo = 'text',
  autoComplete,
  error = null,
  ayuda,
  trailing,
  autoFocus = false,
  disabled = false,
  onBlur,
}: TextFieldProps) {
  const helperId = `${id}-helper`;
  const mensaje = error ?? ayuda;

  // `autoFocus` en el atributo lo marca Sonar (S9379) por accesibilidad y
  // porque React no siempre lo aplica tras la hidratación: el ref es determinista.
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className={`m3-textfield${error !== null ? ' error' : ''}`}>
      <input
        ref={ref}
        id={id}
        name={id}
        type={tipo}
        className="m3-tf"
        placeholder=" "
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error !== null ? true : undefined}
        aria-describedby={mensaje !== undefined ? helperId : undefined}
        required
      />
      <label htmlFor={id} className="m3-tf-label m3-body-large">
        {label}
      </label>
      {trailing}
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
