/**
 * Roles por colegio — módulo Personas.
 *
 * Decisiones cerradas del proyecto:
 *   - Cada persona tiene UN rol. El rol agrupa permisos del catálogo global.
 *   - 5 roles predeterminados por colegio, editables: Docente, Estudiante,
 *     Acudiente, Coordinador, Secretaría (se siembran con el colegio).
 *   - `tipo_persona` decide en qué pestaña del módulo Personas se lista la
 *     persona. Es un dato de organización, NUNCA autorización.
 *   - El admin del colegio sigue siendo especial (`usuarios.es_admin`), no es
 *     un rol editable ni asignable.
 *   - `usuarios_permisos` se mantiene como PROYECCIÓN del rol: el rol es la
 *     única fuente de verdad y el service resincroniza la proyección cuando el
 *     rol o la asignación cambian, para que los guards lean una sola tabla.
 */

import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { colegios } from './colegios';
import { permisos } from './permisos';
import { timestamps } from './_tenant';

/** Pestaña del módulo Personas a la que pertenece un rol. */
export const tiposPersonaRol = ['EMPLEADO', 'ESTUDIANTE', 'ACUDIENTE'] as const;

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    /** Pestaña de Personas donde se listan las personas con este rol. */
    tipoPersona: text('tipo_persona', { enum: tiposPersonaRol }).notNull().default('EMPLEADO'),
    /** Los 5 que se siembran con el colegio; editables pero no borrables. */
    esPredeterminado: boolean('es_predeterminado').notNull().default(false),
    activo: boolean('activo').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique('roles_colegio_nombre_unique').on(t.colegioId, t.nombre),
    index('roles_colegio_tipo_idx').on(t.colegioId, t.tipoPersona),
  ],
);

/**
 * roles_permisos — permisos que otorga cada rol.
 * Lleva `colegio_id` propio para que la política RLS sea uniforme (ADR-002).
 */
export const rolesPermisos = pgTable(
  'roles_permisos',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    rolId: uuid('rol_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permisoId: uuid('permiso_id')
      .notNull()
      .references(() => permisos.id, { onDelete: 'restrict' }),
  },
  (t) => [
    unique('roles_permisos_unique').on(t.rolId, t.permisoId),
    index('roles_permisos_rol_idx').on(t.rolId),
    index('roles_permisos_colegio_idx').on(t.colegioId),
  ],
);

export type Rol = typeof roles.$inferSelect;
export type NewRol = typeof roles.$inferInsert;
export type RolPermiso = typeof rolesPermisos.$inferSelect;