/**
 * Onboarding · gestos de paso y bienvenida.
 *
 * Son las dos piezas que la página delega: el umbral del deslizamiento (con su
 * dominio horizontal) y la decisión de mostrar la pantalla de bienvenida.
 */
import { describe, expect, it } from 'vitest';
import { gestoDePaso, necesitaBienvenida, UMBRAL_GESTO } from '../onboarding-movil';

const AMBOS = { puedeAvanzar: true, puedeVolver: true };
const ORIGEN = { x: 200, y: 300 };

describe('gestoDePaso', () => {
  it('avanza al deslizar hacia la izquierda', () => {
    expect(gestoDePaso(ORIGEN, { x: 120, y: 302 }, AMBOS)).toBe('adelante');
  });

  it('vuelve al deslizar hacia la derecha', () => {
    expect(gestoDePaso(ORIGEN, { x: 280, y: 298 }, AMBOS)).toBe('atras');
  });

  it('no hace nada por debajo del umbral', () => {
    const casi = { x: ORIGEN.x - (UMBRAL_GESTO - 1), y: ORIGEN.y };
    expect(gestoDePaso(ORIGEN, casi, AMBOS)).toBeNull();
  });

  it('el umbral exacto ya cuenta', () => {
    const justo = { x: ORIGEN.x + UMBRAL_GESTO, y: ORIGEN.y };
    expect(gestoDePaso(ORIGEN, justo, AMBOS)).toBe('atras');
  });

  it('ignora el recorrido en diagonal que en realidad es scroll', () => {
    // 70 px a la izquierda pero 60 px hacia abajo: 70 < 60 × 1.5.
    expect(gestoDePaso(ORIGEN, { x: 130, y: 360 }, AMBOS)).toBeNull();
  });

  it('un deslizamiento claramente horizontal sobrevive a un poco de vertical', () => {
    expect(gestoDePaso(ORIGEN, { x: 100, y: 330 }, AMBOS)).toBe('adelante');
  });

  it('no avanza si el paso no está completo', () => {
    expect(
      gestoDePaso(ORIGEN, { x: 120, y: 300 }, { puedeAvanzar: false, puedeVolver: true }),
    ).toBeNull();
  });

  it('no vuelve desde el primer paso', () => {
    expect(
      gestoDePaso(ORIGEN, { x: 280, y: 300 }, { puedeAvanzar: true, puedeVolver: false }),
    ).toBeNull();
  });
});

describe('necesitaBienvenida', () => {
  const vacio = { paso: 1, sedes: [], colegio: { codigoDane: '' } };

  it('la muestra en un colegio recién creado', () => {
    expect(necesitaBienvenida(vacio)).toBe(true);
  });

  it('trata un código con solo espacios como vacío', () => {
    expect(necesitaBienvenida({ ...vacio, colegio: { codigoDane: '   ' } })).toBe(true);
  });

  it('no la muestra si ya hay código DANE', () => {
    expect(necesitaBienvenida({ ...vacio, colegio: { codigoDane: '105001001234' } })).toBe(false);
  });

  it('no la muestra si ya hay sedes', () => {
    expect(necesitaBienvenida({ ...vacio, sedes: [{ id: 'sede-1' }] })).toBe(false);
  });

  it('no la muestra si el wizard ya avanzó', () => {
    expect(necesitaBienvenida({ ...vacio, paso: 3 })).toBe(false);
  });
});
