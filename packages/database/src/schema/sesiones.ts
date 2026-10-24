/**
 * sesiones — sesiones autenticadas del auth propio (cookie httpOnly).
 *
 * Dos "sujetos" posibles y excluyentes (validado por check constraints):
 *   - usuarioId            → usuario de colegio (colegioId NOT NULL) → RLS por colegio.
 *   - plataformaUsuarioId  → usuario del nivel plataforma (colegioId NULL).
 *
 * El token NUNCA se guarda en claro: `tokenHash` = sha256(token + pepper) y el
 * pepper vive SOLO en la API (env), nunca en la base de datos.
 */

import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { colegios } from './colegios';
import { usuarios } from './usuarios';
import { plataformaUsuarios } from './plataforma-usuarios';

export const sesiones = pgTable(
  'sesiones',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id').references(() => colegios.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }),
    plataformaUsuarioId: uuid('plataforma_usuario_id').references(() => plataformaUsuarios.id, {
      onDelete: 'cascade',
    }),
    tokenHash: text('token_hash').notNull().unique(),
    expiraEn: timestamp('expira_en', { withTimezone: true, mode: 'date' }).notNull(),
    revocadaEn: timestamp('revocada_en', { withTimezone: true, mode: 'date' }),
    /** Se actualiza (con throttle) en cada request validada — actividad reciente. */
    ultimaActividadEn: timestamp('ultima_actividad_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    ipOrigen: text('ip_origen'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    // Exactamente un sujeto por sesión (XOR lógico).
    check('sesiones_un_sujeto_check', sql`(usuario_id IS NULL) <> (plataforma_usuario_id IS NULL)`),
    // Las sesiones de colegio SIEMPRE llevan colegio_id (coherencia multi-tenant).
    check('sesiones_colegio_coherente_check', sql`usuario_id IS NULL OR colegio_id IS NOT NULL`),
    index('sesiones_colegio_idx').on(t.colegioId),
    index('sesiones_usuario_idx').on(t.usuarioId),
    index('sesiones_plataforma_idx').on(t.plataformaUsuarioId),
  ],
);

export type Sesion = typeof sesiones.$inferSelect;
export type NewSesion = typeof sesiones.$inferInsert;
