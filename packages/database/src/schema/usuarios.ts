/**
 * Usuarios del colegio (tenant-scoped) + permisos asignados + etiquetas.
 *
 * ADR-003 — autorización por permisos granulares, NO roles fijos:
 *   - `es_admin = true` es el ÚNICO rol fijo (admin del colegio → todos los permisos).
 *   - El resto de usuarios recibe permisos individuales vía `usuarios_permisos`.
 *   - `tipos_usuario`/`usuarios_tipos` son etiquetas informativas de UI,
 *     NUNCA autorización.
 *   - Estudiantes y acudientes también son `usuarios`: se vinculan en
 *     `estudiantes` / `acudientes_estudiantes` y reciben `portal.consultar`.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { AlcancePermiso, TipoDocumento } from '@eduplatform/types';
import { colegios, sedes } from './colegios';
import { permisos } from './permisos';
import { roles } from './roles';
import { timestamps, softDelete } from './_tenant';

export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    usuario: text('usuario').notNull(),
    passwordHash: text('password_hash').notNull(),
    nombres: text('nombres').notNull(),
    apellidos: text('apellidos').notNull(),
    tipoDocumento: text('tipo_documento', {
      enum: [
        TipoDocumento.CC,
        TipoDocumento.TI,
        TipoDocumento.CE,
        TipoDocumento.RC,
        TipoDocumento.PEP,
        TipoDocumento.PPT,
      ],
    }).notNull(),
    numeroDocumento: text('numero_documento').notNull(),
    /** Único "rol" fijo: admin del colegio (todos los permisos implícitos). */
    esAdmin: boolean('es_admin').notNull().default(false),
    /**
     * Rol único de la persona (módulo Personas). `null` mientras no se migre
     * una cuenta antigua con permisos individuales.
     */
    rolId: uuid('rol_id').references(() => roles.id, { onDelete: 'set null' }),
    /** Alcance sobre sedes: TODAS o solo las listadas en `usuarios_sedes`. */
    alcance: text('alcance', { enum: ['TODAS', 'ESPECIFICAS'] })
      .notNull()
      .default('TODAS'),
    activo: boolean('activo').notNull().default(true),
    /** Primer login obliga a cambiar la contraseña (ADR-003). */
    debeCambiarPassword: boolean('debe_cambiar_password').notNull().default(true),
    /** Control de fuerza bruta (se bloquea temporalmente al superar intentos). */
    intentosFallidos: integer('intentos_fallidos').notNull().default(0),
    bloqueadoHasta: timestamp('bloqueado_hasta', { withTimezone: true, mode: 'date' }),
    ultimoAcceso: timestamp('ultimo_acceso', { withTimezone: true, mode: 'date' }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    // El mismo usuario puede existir en colegios distintos; dentro del colegio es único.
    unique('usuarios_colegio_usuario_unique').on(t.colegioId, t.usuario),
    unique('usuarios_colegio_documento_unique').on(t.colegioId, t.tipoDocumento, t.numeroDocumento),
    index('usuarios_colegio_usuario_idx').on(t.colegioId, t.usuario),
    index('usuarios_colegio_activo_idx').on(t.colegioId, t.activo),
  ],
);

/**
 * Alcance de un permiso asignado (ADR-003):
 *   - TODAS_LAS_SEDES: aplica a todo el colegio
 *   - SEDES_ESPECIFICAS: solo las sedes listadas en `sedes_ids`
 *   - MIS_GRUPOS: solo grupos donde es director de grupo (`grupos_ids`)
 *   - MIS_CARGAS: solo donde tiene carga académica
 */
export const alcancePermisoEnumValues = [
  AlcancePermiso.TODAS_LAS_SEDES,
  AlcancePermiso.SEDES_ESPECIFICAS,
  AlcancePermiso.MIS_GRUPOS,
  AlcancePermiso.MIS_CARGAS,
] as const;

/**
 * usuarios_permisos — asignación de permisos que hace el admin del colegio.
 * Lleva `colegio_id` propio para que la política RLS sea uniforme (ADR-002).
 * Si `usuarios.es_admin = true`, esta tabla se IGNORA (todos los permisos).
 */
export const usuariosPermisos = pgTable(
  'usuarios_permisos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    permisoId: uuid('permiso_id')
      .notNull()
      .references(() => permisos.id, { onDelete: 'restrict' }),
    alcance: text('alcance', { enum: alcancePermisoEnumValues })
      .notNull()
      .default(AlcancePermiso.TODAS_LAS_SEDES),
    /** IDs de sedes cuando alcance = SEDES_ESPECIFICAS. */
    sedesIds: uuid('sedes_ids').array(),
    /** IDs de grupos cuando alcance = MIS_GRUPOS. */
    gruposIds: uuid('grupos_ids').array(),
    /** Quién asignó el permiso (auditoría). */
    asignadoPorId: uuid('asignado_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique('usuarios_permisos_unique').on(t.usuarioId, t.permisoId),
    index('usuarios_permisos_usuario_idx').on(t.usuarioId),
    index('usuarios_permisos_colegio_idx').on(t.colegioId),
  ],
);

/**
 * usuarios_sedes — sedes sobre las que actúa una persona cuando su alcance es
 * ESPECIFICAS. El alcance vive en la ASIGNACIÓN, no en el rol: el mismo rol
 * (p. ej. Coordinador) puede ver todas las sedes o solo una.
 */
export const usuariosSedes = pgTable(
  'usuarios_sedes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique('usuarios_sedes_unique').on(t.usuarioId, t.sedeId),
    index('usuarios_sedes_colegio_idx').on(t.colegioId),
  ],
);

/**
 * tipos_usuario — etiquetas organizativas informativas ("Docente",
 * "Coordinador", "Secretaria"...). NO otorgan permisos (ADR-003).
 */
export const tiposUsuario = pgTable(
  'tipos_usuario',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    /** Los predefinidos vienen con el colegio; el admin puede crear más. */
    predefinido: boolean('predefinido').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique('tipos_usuario_colegio_nombre_unique').on(t.colegioId, t.nombre)],
);

/** usuarios_tipos — relación N:M entre usuarios y etiquetas. */
export const usuariosTipos = pgTable(
  'usuarios_tipos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    tipoId: uuid('tipo_id')
      .notNull()
      .references(() => tiposUsuario.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique('usuarios_tipos_unique').on(t.usuarioId, t.tipoId)],
);

export type Usuario = typeof usuarios.$inferSelect;
export type NewUsuario = typeof usuarios.$inferInsert;
export type UsuarioPermiso = typeof usuariosPermisos.$inferSelect;
export type UsuarioSede = typeof usuariosSedes.$inferSelect;
export type TipoUsuario = typeof tiposUsuario.$inferSelect;
