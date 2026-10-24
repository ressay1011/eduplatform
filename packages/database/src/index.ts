/**
 * @eduplatform/database — cliente Drizzle + helpers multi-tenant.
 *
 * Regla de oro (ADR-002): TODA query sobre datos escolares corre dentro de
 * `withTenant(ctx, (tx) => ...)`. La transacción aplica
 * `SET LOCAL app.current_tenant = '<uuid>'` y PostgreSQL (RLS) aísla los
 * datos por colegio aunque una query olvide el WHERE (defensa en profundidad:
 * el filtro explícito en el WHERE sigue siendo obligatorio).
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import type { TenantContext } from './tenant-context';

export * from './schema';
export * from './tenant-context';

export type Database = ReturnType<typeof createDatabase>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Crea una instancia de Drizzle. Cada consumidor (api, scripts de
 * migración/seed) la llama en su bootstrap con su DATABASE_URL.
 *
 * - Runtime de la API: rol `app_user` (SUJETO a RLS).
 * - Migraciones: rol `app_migrator` (dueño del esquema).
 *
 * El pool va acotado a propósito (R3 del informe): sin `idle_timeout` las
 * conexiones se quedan abiertas tras un pico, y sin `statement_timeout` una
 * query colgada ocupa la conexión para siempre.
 */
export function createDatabase(connectionString: string) {
  return crearCliente(connectionString).db;
}

/** Cliente + instancia de Drizzle, para poder cerrar el pool al apagar. */
export function crearCliente(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false,
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    max_lifetime: 1800,
    connection: {
      application_name: 'eduplatform-api',
      statement_timeout: 5000,
    },
  });
  return { client, db: drizzle(client, { schema }) };
}

/** Nombre del rol de runtime que la API DEBE usar (RLS activa solo con él). */
export const ROL_RUNTIME = 'app_user';

/**
 * Ejecuta `fn` dentro de una transacción con el tenant activo.
 *
 * IMPORTANTE: `set_config(..., true)` es LOCAL a la transacción — no se
 * filtra a otras conexiones del pool.
 */
export async function withTenant<T>(
  db: Database,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${ctx.colegioId}, true)`);
    if (ctx.isPlatformAdmin) {
      await tx.execute(sql`SELECT set_config('app.is_platform_admin', 'true', true)`);
    }
    return fn(tx);
  });
}
