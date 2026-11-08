/**
 * NIT colombiano: normalización, forma y dígito de verificación (módulo 11).
 *
 * Los casos del verificador están calculados con la regla de la DIAN y
 * contrastados con NIT reales (Ecopetrol: 899999068-1).
 */
import { describe, expect, it } from 'vitest';
import { digitoVerificadorNit, esNitValido, normalizarNit } from '../nit';

describe('normalizarNit', () => {
  it('quita puntos y espacios y conserva el guion del verificador', () => {
    expect(normalizarNit('900.123.456-7')).toBe('900123456-7');
    expect(normalizarNit(' 900 123 456 ')).toBe('900123456');
  });
});

describe('esNitValido', () => {
  it('acepta el formato de la DIAN y los NIT de 8 a 15 dígitos', () => {
    expect(esNitValido('900123456-7')).toBe(true);
    expect(esNitValido('900.123.456-7')).toBe(true);
    expect(esNitValido('900123456')).toBe(true);
    // La DIAN admite NIT de 8 dígitos antes del verificador en entidades viejas.
    expect(esNitValido('80012345-3')).toBe(true);
    expect(esNitValido('830123456789012')).toBe(true);
  });

  it('rechaza lo que no es un NIT', () => {
    expect(esNitValido('')).toBe(false);
    expect(esNitValido('123')).toBe(false);
    expect(esNitValido('NIT-900123456')).toBe(false);
    expect(esNitValido('900123456-7-8')).toBe(false);
    // Dos dígitos de verificación no son válidos.
    expect(esNitValido('900123456-77')).toBe(false);
    expect(esNitValido('8301234567890123')).toBe(false);
  });
});

describe('digitoVerificadorNit', () => {
  it('calcula el verificador de NIT reales', () => {
    // Ecopetrol: 899.999.068-1.
    expect(digitoVerificadorNit('899999068')).toBe(1);
    expect(digitoVerificadorNit('899.999.068')).toBe(1);
    expect(digitoVerificadorNit('80012345')).toBe(9);
  });

  it('ignora el verificador si el NIT ya lo trae', () => {
    // El NIT del ejemplo del formulario lleva 7, pero el que corresponde es 8.
    expect(digitoVerificadorNit('900123456-7')).toBe(8);
  });

  it('devuelve null si la base no es un NIT', () => {
    expect(digitoVerificadorNit('123')).toBeNull();
    expect(digitoVerificadorNit('')).toBeNull();
    expect(digitoVerificadorNit('NIT-900123456')).toBeNull();
  });
});
