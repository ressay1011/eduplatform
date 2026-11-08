/**
 * `useAnchoMovil`: sin `matchMedia` (jsdom) siempre es escritorio; con una
 * `MediaQueryList` de verdad sigue el ancho y reacciona a los cambios.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ANCHO_MOVIL, useAnchoMovil } from '../useAnchoMovil';

/** MediaQueryList mínima: guarda los oyentes y permite disparar el cambio. */
function mediaQuery(initial: boolean) {
  const oyentes = new Set<(evento: MediaQueryListEvent) => void>();
  return {
    matches: initial,
    media: ANCHO_MOVIL,
    addEventListener: (_tipo: string, oyente: (evento: MediaQueryListEvent) => void): void => {
      oyentes.add(oyente);
    },
    removeEventListener: (_tipo: string, oyente: (evento: MediaQueryListEvent) => void): void => {
      oyentes.delete(oyente);
    },
    disparar(nuevo: boolean): void {
      this.matches = nuevo;
      for (const oyente of oyentes) oyente({ matches: nuevo } as MediaQueryListEvent);
    },
  };
}

function instalar(consulta: { media: string }): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (): unknown => consulta,
  });
}

afterEach(() => {
  // jsdom no implementa matchMedia: se quita el stub para no filtrarlo.
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('useAnchoMovil', () => {
  it('sin matchMedia se queda en escritorio', () => {
    const { result } = renderHook(() => useAnchoMovil());
    expect(result.current).toBe(false);
  });

  it('arranca en móvil cuando la consulta ya coincide', () => {
    instalar(mediaQuery(true));
    const { result } = renderHook(() => useAnchoMovil());
    expect(result.current).toBe(true);
  });

  it('cambia cuando el ancho cruza el punto de corte', () => {
    const consulta = mediaQuery(false);
    instalar(consulta);
    const { result } = renderHook(() => useAnchoMovil());
    expect(result.current).toBe(false);

    act(() => consulta.disparar(true));
    expect(result.current).toBe(true);

    act(() => consulta.disparar(false));
    expect(result.current).toBe(false);
  });
});
