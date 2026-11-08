/**
 * Tests del generador de paleta del colegio.
 * Cubre: semillas que faltan (caen en EduPlatform), determinismo, contraste AA
 * en claro y oscuro, y la selección entre paleta guardada y recalculada.
 */
import { describe, expect, it } from 'vitest';
import { SEMILLAS_EDUPLATFORM, VERSION_PALETA, generarPaleta, paletaDelColegio } from '../paleta';
import type { PaletaColegio } from '../branding';

function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro! + 0.05) / (oscuro! + 0.05);
}

const ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'inversePrimary',
  'surfaceTint',
] as const;

describe('generarPaleta', () => {
  it('resuelve las semillas que falten con las de EduPlatform', () => {
    const paleta = generarPaleta({ primario: '#0b57d0' });
    expect(paleta.semillas).toEqual({
      primario: '#0b57d0',
      secundario: SEMILLAS_EDUPLATFORM.secundario,
      terciario: SEMILLAS_EDUPLATFORM.terciario,
    });
    expect(paleta.version).toBe(VERSION_PALETA);
  });

  it('emite todos los roles en hexadecimal, en claro y en oscuro', () => {
    const paleta = generarPaleta({ primario: '#e8590c' });
    for (const rol of ROLES) {
      expect(paleta.claro[rol]).toMatch(/^#[0-9a-f]{6}$/);
      expect(paleta.oscuro[rol]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('es determinista: la misma semilla da los mismos roles', () => {
    const a = generarPaleta({ primario: '#2e7d32', terciario: '#735471' });
    const b = generarPaleta({ primario: '#2e7d32', terciario: '#735471' });
    expect(a.claro).toEqual(b.claro);
    expect(a.oscuro).toEqual(b.oscuro);
  });

  it('cumple AA en texto sobre primario y contenedores (claro y oscuro)', () => {
    for (const semilla of ['#0b57d0', '#e8590c', '#c62828', '#2e7d32', '#ffe08a', '#111111']) {
      const paleta = generarPaleta({ primario: semilla });
      for (const tema of [paleta.claro, paleta.oscuro]) {
        expect(contraste(tema['onPrimary']!, tema['primary']!)).toBeGreaterThanOrEqual(4.5);
        expect(
          contraste(tema['onPrimaryContainer']!, tema['primaryContainer']!),
        ).toBeGreaterThanOrEqual(4.5);
        expect(contraste(tema['onSecondary']!, tema['secondary']!)).toBeGreaterThanOrEqual(4.5);
        expect(
          contraste(tema['onSecondaryContainer']!, tema['secondaryContainer']!),
        ).toBeGreaterThanOrEqual(4.5);
        expect(contraste(tema['onTertiary']!, tema['tertiary']!)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('un color inválido cae en el primario de EduPlatform', () => {
    const paleta = generarPaleta({ primario: 'no-es-color' });
    expect(paleta.semillas.primario).toBe(SEMILLAS_EDUPLATFORM.primario);
    expect(paleta.claro['primary']).toBe(generarPaleta({}).claro['primary']);
  });
});

describe('paletaDelColegio', () => {
  it('devuelve null cuando el colegio no ha elegido ningún color', () => {
    expect(paletaDelColegio({})).toBeNull();
    expect(paletaDelColegio({ primaryColor: null, secondaryColor: null })).toBeNull();
  });

  it('genera con las semillas que haya, completando con EduPlatform', () => {
    const paleta = paletaDelColegio({ primaryColor: '#0b57d0', secondaryColor: '#c62828' });
    expect(paleta?.semillas).toEqual({
      primario: '#0b57d0',
      secundario: '#c62828',
      terciario: SEMILLAS_EDUPLATFORM.terciario,
    });
  });

  it('respeta la paleta guardada si está completa y en la versión actual', () => {
    const guardada = generarPaleta({ primario: '#0b57d0' });
    const servida = paletaDelColegio({ primaryColor: '#000000', palette: guardada });
    expect(servida).toBe(guardada);
  });

  it('rehace la paleta si la guardada es de otra versión o está incompleta', () => {
    const vieja = { ...generarPaleta({ primario: '#0b57d0' }), version: VERSION_PALETA - 1 };
    const recalculada = paletaDelColegio({ primaryColor: '#0b57d0', palette: vieja });
    expect(recalculada?.version).toBe(VERSION_PALETA);

    const incompleta = {
      version: VERSION_PALETA,
      semillas: { primario: '#0b57d0' },
      claro: { primary: '#000000' },
      oscuro: {},
    } as unknown as PaletaColegio;
    expect(paletaDelColegio({ primaryColor: '#0b57d0', palette: incompleta })?.version).toBe(
      VERSION_PALETA,
    );
  });
});
