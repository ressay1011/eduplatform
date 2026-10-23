/**
 * Tests del tenant context — la base del aislamiento multi-tenant.
 * Sin base de datos ni red: solo el estado global por request.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTenantContext,
  clearTenantContext,
  requireTenantContext,
  getTenantContext,
  NO_TENANT,
  type TenantContext,
} from '../tenant-context';

describe('tenant-context', () => {
  beforeEach(() => {
    clearTenantContext();
  });

  describe('setTenantContext + getTenantContext', () => {
    it('devuelve el contexto establecido', () => {
      const ctx: TenantContext = { colegioId: 'c-1', isPlatformAdmin: false, userId: 'u-1' };
      setTenantContext(ctx);
      expect(getTenantContext()).toEqual(ctx);
    });

    it('clearTenantContext lo elimina', () => {
      setTenantContext({ colegioId: 'c-1', isPlatformAdmin: false });
      clearTenantContext();
      expect(getTenantContext()).toBeNull();
    });

    it('reemplaza el contexto anterior al establecer uno nuevo', () => {
      setTenantContext({ colegioId: 'c-1', isPlatformAdmin: false });
      setTenantContext({ colegioId: 'c-2', isPlatformAdmin: false });
      expect(getTenantContext()?.colegioId).toBe('c-2');
    });
  });

  describe('requireTenantContext', () => {
    it('lanza error cuando no hay contexto', () => {
      expect(() => requireTenantContext()).toThrow(/TenantContext requerido/);
    });

    it('devuelve el contexto cuando está establecido', () => {
      const ctx: TenantContext = { colegioId: 'c-1', isPlatformAdmin: false, userId: 'u-1' };
      setTenantContext(ctx);
      expect(requireTenantContext()).toEqual(ctx);
    });

    it('funciona para super-admin de plataforma (isPlatformAdmin=true)', () => {
      const ctx: TenantContext = { colegioId: 'c-1', isPlatformAdmin: true };
      setTenantContext(ctx);
      expect(requireTenantContext().isPlatformAdmin).toBe(true);
    });
  });

  describe('NO_TENANT', () => {
    it('es un symbol único (sentinel)', () => {
      expect(typeof NO_TENANT).toBe('symbol');
      expect(NO_TENANT.toString()).toContain('NO_TENANT');
    });
  });
});