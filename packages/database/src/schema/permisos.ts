/**
 * permisos — catálogo GLOBAL de permisos del sistema (ADR-003).
 * Lo siembra la migración `0002_seed_permisos.sql`; el admin del colegio
 * solo ASIGNA permisos (usuarios_permisos), nunca los crea ni los borra.
 *
 * Formato de `codigo`: `modulo.accion` (ej: `calificaciones.editar`).
 */

import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const permisos = pgTable(
  'permisos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    codigo: text('codigo').notNull().unique(),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    modulo: text('modulo', {
      enum: [
        'configuracion',
        'usuarios',
        'estructura',
        'calificaciones',
        'horarios',
        'documentos',
        'asistencia',
        'auditoria',
        'portal',
      ],
    }).notNull(),
    /**
     * Acción del permiso. Lista mínima del ADR-003 más las acciones
     * necesarias para casos concretos: `importar` (carga CSV de estudiantes),
     * `generar_masivo` (boletines), `cerrar`/`reabrir` (cierre de períodos),
     * `consultar` (portal estudiante/acudiente).
     */
    accion: text('accion', {
      enum: [
        'ver',
        'crear',
        'editar',
        'eliminar',
        'generar',
        'generar_masivo',
        'importar',
        'exportar',
        'administrar',
        'cerrar',
        'reabrir',
        'consultar',
      ],
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index('permisos_modulo_idx').on(t.modulo)],
);

export type Permiso = typeof permisos.$inferSelect;
export type NewPermiso = typeof permisos.$inferInsert;
