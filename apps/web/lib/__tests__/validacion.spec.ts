import { describe, expect, it } from 'vitest';
import { esEmailValido } from '../validacion';

describe('esEmailValido', () => {
  it('acepta correos institucionales normales', () => {
    expect(esEmailValido('admin@juanaarias.edu.co')).toBe(true);
    expect(esEmailValido('maria.lopez+docente@colegio.edu.co')).toBe(true);
    expect(esEmailValido('a@b.co')).toBe(true);
  });

  it('rechaza formatos incompletos', () => {
    expect(esEmailValido('')).toBe(false);
    expect(esEmailValido('sin-arroba.co')).toBe(false);
    expect(esEmailValido('dos@arrobas@colegio.co')).toBe(false);
    expect(esEmailValido('usuario@dominio')).toBe(false);
    expect(esEmailValido('@colegio.edu.co')).toBe(false);
    expect(esEmailValido('usuario@')).toBe(false);
  });

  it('rechaza espacios y etiquetas mal formadas', () => {
    expect(esEmailValido('usuario con espacio@colegio.co')).toBe(false);
    expect(esEmailValido('usuario@-colegio.co')).toBe(false);
    expect(esEmailValido('usuario@colegio-.co')).toBe(false);
    expect(esEmailValido('usuario@colegio..co')).toBe(false);
  });
});
