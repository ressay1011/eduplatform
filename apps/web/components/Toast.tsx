'use client';

/**
 * Aviso flotante (toast) en la esquina inferior derecha.
 *
 * Sustituye al banner dentro del contenido: con la página desplazada el mensaje
 * quedaba fuera de la vista y el usuario no sabía por qué el botón no avanzaba.
 * Los errores se anuncian con `role="alert"` (assertive) y los éxitos con
 * `role="status"` (polite), que es lo que esperan los lectores de pantalla.
 *
 * Se cierra solo tras `duracion` milisegundos o con la ✕. El temporizador se
 * reinicia cuando cambia el texto, así un mensaje nuevo no hereda el tiempo del
 * anterior.
 */
import { useEffect, useRef } from 'react';

interface ToastProps {
  mensaje: string;
  tono: 'error' | 'exito';
  onCerrar: () => void;
  /** Milisegundos antes de cerrarse solo. Sin valor, se queda hasta la ✕. */
  duracion?: number | undefined;
}

const ICONO = { error: 'error', exito: 'check_circle' } as const;

export function Toast({ mensaje, tono, onCerrar, duracion }: ToastProps) {
  // `onCerrar` puede cambiar de identidad en cada render sin que eso deba
  // reiniciar la cuenta atrás: se guarda en una ref (desde un efecto, que es
  // donde React permite escribirla).
  const cerrarRef = useRef(onCerrar);
  useEffect(() => {
    cerrarRef.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    if (duracion === undefined) return;
    const id = setTimeout(() => cerrarRef.current(), duracion);
    return () => clearTimeout(id);
  }, [mensaje, duracion]);

  return (
    <div
      className={`m3-toast m3-toast--${tono}`}
      role={tono === 'error' ? 'alert' : 'status'}
      aria-live={tono === 'error' ? 'assertive' : 'polite'}
    >
      <span className="material-symbols-outlined m3-toast-icono" aria-hidden="true">
        {ICONO[tono]}
      </span>
      <p className="m3-toast-texto">{mensaje}</p>
      <button
        type="button"
        className="m3-toast-cerrar"
        onClick={onCerrar}
        aria-label="Cerrar aviso"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  );
}
