import { describe, expect, it } from 'vitest';
import { anioLocal, hoyLocal } from '../fecha';

describe('hoyLocal', () => {
  it('usa el calendario de Colombia y no el de UTC', () => {
    // 8-nov 01:30 UTC son las 20:30 del 7-nov en Bogotá: la matrícula debe ir al 7.
    expect(hoyLocal(new Date('2026-11-08T01:30:00Z'))).toBe('2026-11-07');
  });

  it('cambia de día a las 05:00 UTC, que es medianoche en Colombia', () => {
    expect(hoyLocal(new Date('2026-11-08T04:59:59Z'))).toBe('2026-11-07');
    expect(hoyLocal(new Date('2026-11-08T05:00:00Z'))).toBe('2026-11-08');
  });

  it('en nochevieja sigue en el año anterior hasta la medianoche local', () => {
    expect(hoyLocal(new Date('2026-01-01T04:00:00Z'))).toBe('2025-12-31');
    expect(hoyLocal(new Date('2026-01-01T05:00:00Z'))).toBe('2026-01-01');
  });

  it('devuelve el formato del contrato (AAAA-MM-DD)', () => {
    expect(hoyLocal(new Date('2026-01-05T15:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('anioLocal', () => {
  it('no adelanta el año por la noche del 31 de diciembre', () => {
    // 23:00 del 31-dic en Colombia, ya 1-ene en UTC.
    expect(anioLocal(new Date('2026-01-01T04:00:00Z'))).toBe(2025);
    expect(anioLocal(new Date('2026-01-01T05:00:00Z'))).toBe(2026);
  });
});
