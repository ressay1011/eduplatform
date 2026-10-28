import { describe, expect, it } from 'vitest';
import {
  esEmailValido,
  esNitValido,
  esTelefonoValido,
  normalizarNit,
  esUsuarioValido,
} from '../validacion';

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

describe('normalizarNit y esNitValido', () => {
  it('quita puntos y espacios y deja el guion del verificador', () => {
    expect(normalizarNit('900.123.456-7')).toBe('900123456-7');
    expect(normalizarNit(' 900 123 456 ')).toBe('900123456');
  });

  it('acepta el formato de la DIAN y los NIT de 8 dígitos', () => {
    expect(esNitValido('900123456-7')).toBe(true);
    expect(esNitValido('900.123.456-7')).toBe(true);
    expect(esNitValido('900123456')).toBe(true);
    // La DIAN admite NIT de 8 dígitos antes del verificador en entidades viejas.
    expect(esNitValido('80012345-3')).toBe(true);
  });

  it('rechaza lo que no es un NIT', () => {
    expect(esNitValido('')).toBe(false);
    expect(esNitValido('123')).toBe(false);
    expect(esNitValido('NIT-900123456')).toBe(false);
    expect(esNitValido('900123456-7-8')).toBe(false);
    // Dos dígitos de verificación no son válidos.
    expect(esNitValido('900123456-77')).toBe(false);
  });
});

describe('esTelefonoValido', () => {
  it('acepta fijos y celulares con separadores', () => {
    expect(esTelefonoValido('3001234567')).toBe(true);
    expect(esTelefonoValido('300 123 4567')).toBe(true);
    expect(esTelefonoValido('(5) 385 1234')).toBe(true);
    expect(esTelefonoValido('+57 300 123 4567')).toBe(true);
  });

  it('rechaza longitudes y caracteres raros', () => {
    expect(esTelefonoValido('')).toBe(false);
    expect(esTelefonoValido('12345')).toBe(false);
    expect(esTelefonoValido('300-123-4567 ext 2')).toBe(false);
    expect(esTelefonoValido('telefono')).toBe(false);
  });
});

describe('esUsuarioValido', () => {
  it.each(['admin@juanaarias', 'rector.garcia', 'ana_maria-2', 'cc1088123456', 'abc'])(
    'acepta %s',
    (valor) => {
      expect(esUsuarioValido(valor)).toBe(true);
    },
  );

  it.each([
    'ab', // menos de 3
    'Admin@Juana', // mayúsculas
    'con espacio',
    'usuario!',
    '.empieza-por-punto',
    'termina-en-guion-',
    'a'.repeat(65),
  ])('rechaza %s', (valor) => {
    expect(esUsuarioValido(valor)).toBe(false);
  });
});
