/**
 * Tests unitarios de SessionTokenService — generación y hasheo de tokens
 * de sesión (no requieren BD ni Nest).
 */
import { describe, expect, it } from 'vitest';
import { SessionTokenService } from '../session-token.service';

describe('SessionTokenService', () => {
  const servicio = new SessionTokenService();

  it('genera tokens distintos, largos y URL-safe', () => {
    const a = servicio.generar();
    const b = servicio.generar();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(60);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('el hash es determinístico, hex de 64 y no expone el token', () => {
    const token = servicio.generar();
    const h1 = servicio.hash(token);
    const h2 = servicio.hash(token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain(token);
    expect(servicio.hash(`${token}x`)).not.toBe(h1);
  });
});