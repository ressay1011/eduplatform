/**
 * Asistencia diaria (módulo OPCIONAL por colegio) + audit log (obligatorio).
 *
 * - asistencias_diarias: solo aplica si configuracion_colegio.modulo_asistencia_activo.
 *   Alimenta el conteo de `notas_periodo.fallas` (v1.1; en MVP el conteo es manual).
 * - audit_log: OBLIGATORIO (Ley 1581 — datos de menores). Registra accesos y
 *   cambios sensibles; el rector ve los de su colegio, plataforma ve cross-tenant.
 */

import { sql } from 'drizzle-orm';
import { date, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { EstadoAsistencia } from '@eduplatform/types';
import { colegios } from './colegios';
import { usuarios } from './usuarios';
import { estudiantes } from './estudiantes';
import { grupos } from './estructura';
import { timestamps } from './_tenant';

export const asistenciasDiarias = pgTable(
  'asistencias_diarias',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'cascade' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudiantes.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull(),
    estado: text('estado', {
      enum: [
        EstadoAsistencia.PRESENTE,
        EstadoAsistencia.AUSENTE,
        EstadoAsistencia.AUSENTE_JUSTIFICADO,
        EstadoAsistencia.TARDE,
      ],
    }).notNull(),
    registradoPorId: uuid('registrado_por_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    unique('asistencias_unique').on(t.grupoId, t.estudianteId, t.fecha),
    index('asistencias_colegio_fecha_idx').on(t.colegioId, t.fecha),
  ],
);

/**
 * audit_log — una fila por acción sensible. `colegio_id` nullable para
 * acciones de plataforma (cross-tenant) sin colegio asociado.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id').references(() => colegios.id, { onDelete: 'set null' }),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    accion: text('accion', {
      enum: [
        'READ',
        'CREATE',
        'UPDATE',
        'DELETE',
        'EXPORT',
        'LOGIN',
        'LOGOUT',
        'LOGIN_FAILED',
        'PERMISSION_DENIED',
      ],
    }).notNull(),
    /** Entidad afectada, ej: 'usuarios', 'calificaciones', 'certificados'. */
    entidad: text('entidad').notNull(),
    entidadId: uuid('entidad_id'),
    /** Contexto: IP, user-agent, diffs (antes/después), motivo. */
    metadata: jsonb('metadata').$type<{
      ip?: string;
      userAgent?: string;
      cambios?: Record<string, { antes: unknown; despues: unknown }>;
      motivo?: string;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('audit_log_colegio_fecha_idx').on(t.colegioId, t.createdAt),
    index('audit_log_usuario_fecha_idx').on(t.usuarioId, t.createdAt),
    index('audit_log_entidad_idx').on(t.entidad, t.entidadId),
  ],
);

export type AsistenciaDiaria = typeof asistenciasDiarias.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
