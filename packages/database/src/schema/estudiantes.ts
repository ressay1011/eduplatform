/**
 * Estudiantes (datos SIMAT, 1:1 con usuarios) y su vínculo N:M con
 * acudientes (que también son `usuarios`).
 *
 * Un estudiante es un `usuarios` + registro aquí + permiso `portal.consultar`.
 * Un acudiente es un `usuarios` + vínculo en `acudientes_estudiantes`.
 */

import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { EstadoEstudiante } from '@eduplatform/types';
import { colegios } from './colegios';
import { usuarios } from './usuarios';
import { timestamps, softDelete } from './_tenant';

export const estudiantes = pgTable(
  'estudiantes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    /** 1:1 con usuarios (el estudiante siempre tiene cuenta). */
    usuarioId: uuid('usuario_id')
      .notNull()
      .unique()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    /** Código de matrícula interno del colegio (único por colegio). */
    codigoMatricula: text('codigo_matricula').notNull(),
    fechaNacimiento: date('fecha_nacimiento').notNull(),
    sexo: text('sexo', { enum: ['M', 'F'] }),
    lugarExpedicionDocumento: text('lugar_expedicion_documento'),
    municipioNacimiento: text('municipio_nacimiento'),
    direccionResidencia: text('direccion_residencia'),
    barrio: text('barrio'),
    /** Estrato socioeconómico 1–6 (nullable: algunos no reportan). */
    estrato: integer('estrato'),
    eps: text('eps'),
    /** RH — ej: "O+". */
    rh: text('rh'),
    sisbenNivel: text('sisben_nivel'),
    discapacidad: text('discapacidad'),
    poblacionVictima: boolean('poblacion_victima').notNull().default(false),
    pertenenciaEtnica: text('pertenencia_etnica'),
    estado: text('estado', {
      enum: [
        EstadoEstudiante.INSCRITO,
        EstadoEstudiante.MATRICULADO,
        EstadoEstudiante.RETIRADO,
        EstadoEstudiante.GRADUADO,
      ],
    })
      .notNull()
      .default(EstadoEstudiante.MATRICULADO),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    unique('estudiantes_colegio_codigo_unique').on(t.colegioId, t.codigoMatricula),
    index('estudiantes_colegio_estado_idx').on(t.colegioId, t.estado),
  ],
);

/**
 * acudientes_estudiantes — relación N:M acudiente (usuario) ↔ estudiante.
 * Un acudiente puede tener varios hijos; un estudiante varios acudientes.
 */
export const acudientesEstudiantes = pgTable(
  'acudientes_estudiantes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    acudienteId: uuid('acudiente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudiantes.id, { onDelete: 'cascade' }),
    /** Texto libre: padre, madre, tío, abuela, etc. */
    parentesco: text('parentesco').notNull(),
    telefono: text('telefono'),
    ocupacion: text('ocupacion'),
    /** Acudiente principal (a quién se contacta primero). */
    esPrincipal: boolean('es_principal').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique('acudientes_estudiantes_unique').on(t.acudienteId, t.estudianteId),
    index('acudientes_estudiantes_colegio_idx').on(t.colegioId),
    index('acudientes_estudiantes_estudiante_idx').on(t.estudianteId),
  ],
);

export type Estudiante = typeof estudiantes.$inferSelect;
export type NewEstudiante = typeof estudiantes.$inferInsert;
export type AcudienteEstudiante = typeof acudientesEstudiantes.$inferSelect;
