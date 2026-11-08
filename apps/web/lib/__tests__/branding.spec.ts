/**
 * Tests del branding en el navegador: aplicar la paleta (claro/oscuro),
 * guardarla, releerla y el atajo de un solo color.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { generarPaleta } from '@eduplatform/types';
import {
  CLAVE_BRANDING,
  aplicarBranding,
  aplicarGuardado,
  aplicarPaleta,
  guardarPaleta,
  leerPaletaGuardada,
  limpiarPaleta,
} from '../branding';

function token(nombre: string): string {
  return document.documentElement.style.getPropertyValue(nombre);
}

const paleta = generarPaleta({ primario: '#0b57d0' });

describe('aplicarPaleta', () => {
  it('aplica todos los roles M3 del tema claro con nombres kebab', () => {
    aplicarPaleta(paleta, false);
    expect(token('--md-sys-color-primary')).toBe(paleta.claro['primary']);
    expect(token('--md-sys-color-on-primary-container')).toBe(paleta.claro['onPrimaryContainer']);
    expect(token('--md-sys-color-tertiary-container')).toBe(paleta.claro['tertiaryContainer']);
    expect(token('--aurora-1')).toBe(paleta.claro['primary']);
  });

  it('usa la variante oscura cuando el tema es oscuro', () => {
    aplicarPaleta(paleta, true);
    expect(token('--md-sys-color-primary')).toBe(paleta.oscuro['primary']);
    expect(token('--md-sys-color-on-primary')).toBe(paleta.oscuro['onPrimary']);
  });
});

describe('guardarPaleta y leerPaletaGuardada', () => {
  beforeEach(() => localStorage.clear());

  it('guarda el código y la paleta, y los devuelve', () => {
    guardarPaleta('juanaarias', paleta);
    const leido = leerPaletaGuardada();
    expect(leido?.codigo).toBe('juanaarias');
    expect(leido?.paleta.claro).toEqual(paleta.claro);
  });

  it('ignora JSON roto o sin paleta', () => {
    localStorage.setItem(CLAVE_BRANDING, '{no-es-json');
    expect(leerPaletaGuardada()).toBeNull();

    localStorage.setItem(CLAVE_BRANDING, JSON.stringify({ codigo: 'juanaarias' }));
    expect(leerPaletaGuardada()).toBeNull();
  });

  it('aplicarGuardado pinta lo guardado sin red', () => {
    guardarPaleta('juanaarias', paleta);
    document.documentElement.style.removeProperty('--md-sys-color-primary');
    aplicarGuardado();
    expect(token('--md-sys-color-primary')).toBe(paleta.claro['primary']);
  });

  it('limpiarPaleta borra lo guardado y las variables (colegio inexistente)', () => {
    guardarPaleta('juanaarias', paleta);
    aplicarPaleta(paleta, false);
    limpiarPaleta();
    expect(token('--md-sys-color-primary')).toBe('');
    expect(token('--md-sys-color-tertiary-container')).toBe('');
    expect(leerPaletaGuardada()).toBeNull();
  });
});

describe('aplicarBranding (colegio con un solo color)', () => {
  beforeEach(() => localStorage.clear());

  it('genera la paleta desde ese color y la guarda si hay código', () => {
    aplicarBranding('#0b57d0', 'juanaarias');
    expect(token('--md-sys-color-primary')).toMatch(/^#[0-9a-f]{6}$/);
    expect(leerPaletaGuardada()?.codigo).toBe('juanaarias');
    expect(leerPaletaGuardada()?.paleta.semillas.secundario).toBeTruthy();
  });

  it('no hace nada con null', () => {
    document.documentElement.style.removeProperty('--md-sys-color-primary');
    aplicarBranding(null);
    expect(token('--md-sys-color-primary')).toBe('');
  });
});
