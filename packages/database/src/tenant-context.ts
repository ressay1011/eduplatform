/**
 * TenantContext — encapsula el colegio activo en la request actual.
 *
 * Patrón multi-tenant (ADR-002 — seguridad por defecto):
 *   - Toda query sobre datos escolares corre dentro de una transacción con
 *     `SET LOCAL app.current_tenant = '<uuid>'`; PostgreSQL aplica RLS y
 *     filtra por colegio aunque la query olvide el WHERE.
 *   - El filtro explícito `colegio_id = ctx.colegioId` en el WHERE sigue
 *     siendo obligatorio (defensa en profundidad).
 *   - Este contexto lo establece el TenantGuard al inicio de cada request
 *     y lo limpia al terminar.
 */

export interface TenantContext {
  /** UUID del colegio activo (tenant). */
  readonly colegioId: string;
  /**
   * true SOLO para operaciones cross-tenant del super-admin de plataforma.
   * En requests normales es siempre false (aunque el usuario sea admin del colegio).
   */
  readonly isPlatformAdmin: boolean;
  /** UUID del usuario autenticado (opcional — auditoría). */
  readonly userId?: string;
}

/** Sentinel que indica "no hay tenant context activo". */
export const NO_TENANT: unique symbol = Symbol('NO_TENANT');
export type NoTenant = typeof NO_TENANT;

declare global {
  var __eduplatform_tenant_ctx__: TenantContext | NoTenant | undefined;
}

/**
 * Establece el tenant context de la request actual.
 * Lo llama el TenantGuard; no lo uses en otro lugar sin justificarlo.
 */
export function setTenantContext(ctx: TenantContext): void {
  globalThis.__eduplatform_tenant_ctx__ = ctx;
}

/** Limpia el tenant context (al terminar la request). */
export function clearTenantContext(): void {
  globalThis.__eduplatform_tenant_ctx__ = undefined;
}

/**
 * Obtiene el tenant context activo o lanza un error ruidoso.
 * Programación defensiva: mejor fallar claro que filtrar datos sin contexto.
 */
export function requireTenantContext(): TenantContext {
  const ctx = globalThis.__eduplatform_tenant_ctx__;
  if (!ctx || ctx === NO_TENANT) {
    throw new Error(
      'TenantContext requerido pero no establecido. ' +
        'Usa withTenant(ctx, ...) o verifica que TenantGuard se ejecutó.',
    );
  }
  return ctx;
}

/** Variante no-tirante: devuelve null si no hay contexto. */
export function getTenantContext(): TenantContext | null {
  const ctx = globalThis.__eduplatform_tenant_ctx__;
  if (!ctx || ctx === NO_TENANT) return null;
  return ctx;
}
