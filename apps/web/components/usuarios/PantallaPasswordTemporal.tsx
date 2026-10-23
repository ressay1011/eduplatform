'use client';

/**
 * PantallaPasswordTemporal — muestra la contraseña temporal UNA sola vez
 * (la API nunca la guarda en claro). Permite copiarla antes de continuar.
 */
import { useCallback, useState } from 'react';
import { M3Button } from '@/components/M3Button';

interface PantallaPasswordTemporalProps {
  password: string;
  titulo: string;
  descripcion: string;
  textoBoton: string;
  onContinuar: () => void;
}

export function PantallaPasswordTemporal({
  password,
  titulo,
  descripcion,
  textoBoton,
  onContinuar,
}: PantallaPasswordTemporalProps) {
  const [copiada, setCopiada] = useState(false);

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el usuario puede seleccionarla a mano.
      setCopiada(false);
    }
  }, [password]);

  return (
    <section className="password-card" aria-labelledby="password-temporal-titulo">
      <div>
        <h2
          id="password-temporal-titulo"
          className="m3-title-medium"
          style={{ margin: '0 0 4px 0' }}
        >
          {titulo}
        </h2>
        <p
          className="m3-body-medium"
          style={{ margin: 0, color: 'var(--md-sys-color-on-surface-variant)' }}
        >
          {descripcion}
        </p>
      </div>

      <div
        className="password-valor"
        aria-label="Contraseña temporal"
        onClick={copiar}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') void copiar();
        }}
      >
        {password}
      </div>

      <div className="acciones-fila" style={{ marginTop: 0 }}>
        <M3Button variante="tonal" onClick={copiar} icono={copiada ? 'check' : 'content_copy'}>
          {copiada ? 'Copiada' : 'Copiar contraseña'}
        </M3Button>
        <M3Button onClick={onContinuar} icono="arrow_forward" iconoAlFinal>
          {textoBoton}
        </M3Button>
      </div>

      <p
        className="m3-body-small"
        style={{ margin: 0, color: 'var(--md-sys-color-on-surface-variant)' }}
      >
        No se volverá a mostrar. La persona deberá cambiarla al entrar por primera vez.
      </p>
    </section>
  );
}
