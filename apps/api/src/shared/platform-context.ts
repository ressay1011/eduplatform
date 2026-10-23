/**
 * Contexto tenant para operaciones del nivel PLATAFORMA (cross-tenant).
 * El UUID dummy nunca hace match con un colegio real: la política RLS que
 * aplica es la de `app.is_platform_admin` (ADR-002), no la del tenant.
 */
import type { TenantContext } from '@eduplatform/database';

export const SIN_COLEGIO_ID = '00000000-0000-0000-0000-000000000000';

export function platformTenantContext(): TenantContext {
  return { colegioId: SIN_COLEGIO_ID, isPlatformAdmin: true };
}