/**
 * Helpers compartidos por todas las tablas (MODELO-DATOS §Convenciones):
 *   - `timestamps`: created_at / updated_at (con now() por defecto)
 *   - `softDelete`: deleted_at nullable (solo entidades principales)
 *
 * Convenciones del esquema:
 *   - Nombres de tabla/columna en snake_case (BD) — camelCase en TypeScript.
 *   - `id` es uuid con gen_random_uuid() (PostgreSQL ≥13, sin extensión).
 *   - Toda tabla de datos escolares lleva `colegio_id` (RLS — ADR-002).
 */

import { sql } from 'drizzle-orm';
import { timestamp } from 'drizzle-orm/pg-core';

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
};

export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
};
