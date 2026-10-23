/**
 * Horarios: aulas, bloques de tiempo y asignación de clases.
 *
 * Restricciones de choque (se validan en la capa de servicio, no en BD):
 *   - Un docente no puede tener 2 clases en el mismo bloque.
 *   - Un grupo no puede tener 2 clases en el mismo bloque.
 *   - Un aula no puede tener 2 clases en el mismo bloque.
 * Los índices de unicidad cubren docente y grupo a nivel de BD.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { Jornada, TipoBloque } from '@eduplatform/types';
import { colegios } from './colegios';
import { usuarios } from './usuarios';
import { aniosLectivos, asignaturas, grupos } from './estructura';
import { timestamps } from './_tenant';

/** aulas — salones del colegio (algunos se comparten entre grupos). */
export const aulas = pgTable(
  'aulas',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    capacidad: smallint('capacidad'),
    activa: boolean('activa').notNull().default(true),
    ...timestamps,
  },
  (t) => [unique('aulas_colegio_nombre_unique').on(t.colegioId, t.nombre)],
);

/**
 * bloques_horarios — slots de tiempo definidos por jornada y día.
 * Ej: bloque 1 = lunes a viernes 7:00–7:50.
 */
export const bloquesHorarios = pgTable(
  'bloques_horarios',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    anioLectivoId: uuid('anio_lectivo_id')
      .notNull()
      .references(() => aniosLectivos.id, { onDelete: 'cascade' }),
    jornada: text('jornada', {
      enum: [Jornada.MANANA, Jornada.TARDE, Jornada.UNICA, Jornada.NOCTURNA],
    }).notNull(),
    /** 1 = lunes … 6 = sábado. */
    diaSemana: smallint('dia_semana').notNull(),
    numeroBloque: smallint('numero_bloque').notNull(),
    horaInicio: time('hora_inicio').notNull(),
    horaFin: time('hora_fin').notNull(),
    tipo: text('tipo', { enum: [TipoBloque.CLASE, TipoBloque.DESCANSO, TipoBloque.ALMUERZO] })
      .notNull()
      .default(TipoBloque.CLASE),
    ...timestamps,
  },
  (t) => [
    unique('bloques_unique').on(t.anioLectivoId, t.jornada, t.diaSemana, t.numeroBloque),
  ],
);

/**
 * horarios — asignación de (grupo, asignatura, docente, aula) a un bloque.
 * NOTA: el MODELO-DATOS listaba `aula` como texto; usamos FK a `aulas.id`
 * (nullable) porque el catálogo `aulas` existe y permite validar ocupación.
 */
export const horarios = pgTable(
  'horarios',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    bloqueId: uuid('bloque_id')
      .notNull()
      .references(() => bloquesHorarios.id, { onDelete: 'cascade' }),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'cascade' }),
    asignaturaId: uuid('asignatura_id')
      .notNull()
      .references(() => asignaturas.id, { onDelete: 'restrict' }),
    docenteId: uuid('docente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    aulaId: uuid('aula_id').references(() => aulas.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    unique('horarios_grupo_bloque_unique').on(t.bloqueId, t.grupoId),
    unique('horarios_docente_bloque_unique').on(t.bloqueId, t.docenteId),
    index('horarios_bloque_aula_idx').on(t.bloqueId, t.aulaId),
    index('horarios_colegio_grupo_idx').on(t.colegioId, t.grupoId),
  ],
);

export type Aula = typeof aulas.$inferSelect;
export type BloqueHorario = typeof bloquesHorarios.$inferSelect;
export type Horario = typeof horarios.$inferSelect;