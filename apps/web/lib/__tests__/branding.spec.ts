/** Tests del branding por colegio (derivación de tokens desde el color semilla). */
import { describe, expect, it } from 'vitest';
import { aplicarBranding } from '../branding';

function leerToken(nombre: string): string {
  return document.documentElement.style.getPropertyValue(nombre);
}

describe('aplicarBranding', () => {
  it('sobreescribe primary/on-primary/container con un color oscuro', () => {
    aplicarBranding('#a3331a');
    expect(leerToken('--md-sys-color-primary')).toBe('#a3331a');
    expect(leerToken('--md-sys-color-on-primary')).toBe('#ffffff');
    expect(leerToken('--md-sys-color-primary-container')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('usa texto oscuro con colores claros (contraste)', () => {
    aplicarBranding('#ffe08a');
    expect(leerToken('--md-sys-color-on-primary')).toBe('#001a41');
  });

  it('ignora colores inválidos y valores null (no-op)', () => {
    document.documentElement.style.removeProperty('--md-sys-color-primary');
    aplicarBranding('no-es-color');
    aplicarBranding(null);
    expect(leerToken('--md-sys-color-primary')).toBe('');
  });
});