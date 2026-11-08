/** Lectura de SQLSTATE (compartida): código directo, en `cause`, o ninguno. */
import { describe, expect, it } from 'vitest';
import { codigoPg, esViolacionUnica } from '../pg-errors';

describe('codigoPg', () => {
  it('lee el código directo y el que drizzle deja en `cause`', () => {
    expect(codigoPg(Object.assign(new Error('x'), { code: '23505' }))).toBe('23505');
    expect(codigoPg(new Error('Failed query', { cause: { code: '23503' } }))).toBe('23503');
  });

  it('devuelve undefined cuando no hay código de Postgres', () => {
    expect(codigoPg(new Error('x'))).toBeUndefined();
    expect(codigoPg(null)).toBeUndefined();
    expect(codigoPg(undefined)).toBeUndefined();
    expect(codigoPg('texto')).toBeUndefined();
    expect(codigoPg({ code: 42 })).toBeUndefined();
  });
});

describe('esViolacionUnica', () => {
  it('acepta 23505 en cualquiera de los dos niveles y nada más', () => {
    expect(esViolacionUnica({ code: '23505' })).toBe(true);
    expect(esViolacionUnica({ cause: { code: '23505' } })).toBe(true);
    expect(esViolacionUnica({ code: '23503' })).toBe(false);
    expect(esViolacionUnica(undefined)).toBe(false);
  });
});
