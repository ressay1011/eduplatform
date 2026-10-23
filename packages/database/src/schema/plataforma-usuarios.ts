/**
 * plataforma_usuarios — usuarios del nivel PLATAFORMA (equipo SaaS:
 * super-admins y soporte). NO pertenecen a ningún colegio.
 *
 * ADR-002: esta tabla NO es tenant-scoped; su acceso queda restringido
 * por política RLS propia (solo con app.is_platform_admin = true).
 */

import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { RolPlataforma } from '@eduplatform/types';
import { timestamps } from './_tenant';

export const plataformaUsuarios = pgTable('plataforma_usuarios', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nombreCompleto: text('nombre_completo').notNull(),
  rol: text('rol', { enum: [RolPlataforma.SUPER_ADMIN, RolPlataforma.SOPORTE] }).notNull(),
  activo: boolean('activo').notNull().default(true),
  ...timestamps,
});

export type PlataformaUsuario = typeof plataformaUsuarios.$inferSelect;
export type NewPlataformaUsuario = typeof plataformaUsuarios.$inferInsert;