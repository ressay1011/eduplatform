/**
 * Estructura académica (tenant-scoped): años lectivos, períodos, grados,
 * grupos, áreas, asignaturas, carga académica y matrículas.
 *
 * El CIERRE de períodos es por FECHAS (cron diario), no por botón:
 * `fecha_apertura_notas` / `fecha_cierre_notas` (ADR-003).
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { CondicionMatricula, EstadoPeriodo, Jornada, TipoCierre } from '@eduplatform/types';
import { colegios, sedes } from './colegios';
import { usuarios } from './usuarios';
import { estudiantes } from './estudiantes';
import { timestamps } from './_tenant';

export const aniosLectivos = pgTable(
  'anios_lectivos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    anio: integer('anio').notNull(), // ej: 2026
    fechaInicio: date('fecha_inicio').notNull(),
    fechaFin: date('fecha_fin').notNull(),
    estado: text('estado', { enum: ['CONFIGURACION', 'ACTIVO', 'CERRADO'] })
      .notNull()
      .default('CONFIGURACION'),
    ...timestamps,
  },
  (t) => [unique('anios_lectivos_colegio_anio_unique').on(t.colegioId, t.anio)],
);

export const periodos = pgTable(
  'periodos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    anioLectivoId: uuid('anio_lectivo_id')
      .notNull()
      .references(() => aniosLectivos.id, { onDelete: 'cascade' }),
    numero: smallint('numero').notNull(), // 1..4
    nombre: text('nombre').notNull(),
    fechaInicio: date('fecha_inicio').notNull(),
    fechaFin: date('fecha_fin').notNull(),
    /** Desde cuándo el docente PUEDE escribir notas. */
    fechaAperturaNotas: date('fecha_apertura_notas').notNull(),
    /** Cuándo el cron cierra el período automáticamente. */
    fechaCierreNotas: date('fecha_cierre_notas').notNull(),
    estado: text('estado', {
      enum: [EstadoPeriodo.PENDIENTE, EstadoPeriodo.ACTIVO, EstadoPeriodo.CERRADO],
    })
      .notNull()
      .default(EstadoPeriodo.PENDIENTE),
    cerradoEn: timestamp('cerrado_en', { withTimezone: true, mode: 'date' }),
    /** null mientras no se ha cerrado; AUTOMATICO si lo cerró el cron. */
    tipoCierre: text('tipo_cierre', {
      enum: [TipoCierre.AUTOMATICO, TipoCierre.MANUAL_ANTICIPADO, TipoCierre.MANUAL_REAPERTURA],
    }),
    ...timestamps,
  },
  (t) => [
    unique('periodos_anio_numero_unique').on(t.anioLectivoId, t.numero),
    index('periodos_colegio_estado_idx').on(t.colegioId, t.estado),
    index('periodos_colegio_cierre_idx').on(t.colegioId, t.fechaCierreNotas),
  ],
);

/**
 * grados — catálogo habilitado por colegio (0 = Transición (preescolar),
 * 1–5 primaria, 6–11 bachillerato).
 */
export const grados = pgTable(
  'grados',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    nivel: text('nivel', { enum: ['PREESCOLAR', 'PRIMARIA', 'BACHILLERATO'] }).notNull(),
    numero: smallint('numero').notNull(),
    nombre: text('nombre').notNull(),
    activo: boolean('activo').notNull().default(true),
    ...timestamps,
  },
  (t) => [unique('grados_colegio_numero_unique').on(t.colegioId, t.numero)],
);

/** grupos — cursos concretos (6A, 6B) de un año lectivo. */
export const grupos = pgTable(
  'grupos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'restrict' }),
    anioLectivoId: uuid('anio_lectivo_id')
      .notNull()
      .references(() => aniosLectivos.id, { onDelete: 'cascade' }),
    gradoId: uuid('grado_id')
      .notNull()
      .references(() => grados.id, { onDelete: 'restrict' }),
    letra: text('letra').notNull(),
    jornada: text('jornada', {
      enum: [Jornada.MANANA, Jornada.TARDE, Jornada.UNICA, Jornada.NOCTURNA, Jornada.FIN_SEMANA],
    }).notNull(),
    /** Docente director de grupo (nullable). */
    directorGrupoId: uuid('director_grupo_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    cupoMaximo: integer('cupo_maximo'),
    ...timestamps,
  },
  (t) => [
    unique('grupos_anio_sede_grado_letra_jornada_unique').on(
      t.anioLectivoId,
      t.sedeId,
      t.gradoId,
      t.letra,
      t.jornada,
    ),
    index('grupos_colegio_anio_idx').on(t.colegioId, t.anioLectivoId),
    index('grupos_colegio_director_idx').on(t.colegioId, t.directorGrupoId),
  ],
);

/** areas — áreas fundamentales (Ley 115 arts. 23/31), sembradas por colegio. */
export const areas = pgTable(
  'areas',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    obligatoria: boolean('obligatoria').notNull().default(true),
    ...timestamps,
  },
  (t) => [unique('areas_colegio_nombre_unique').on(t.colegioId, t.nombre)],
);

/** asignaturas — dentro de un área; `intensidad_horaria` en horas/semana. */
export const asignaturas = pgTable(
  'asignaturas',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    gradoId: uuid('grado_id').references(() => grados.id, { onDelete: 'restrict' }),
    nombre: text('nombre').notNull(),
    intensidadHoraria: smallint('intensidad_horaria').notNull(),
    ...timestamps,
  },
  (t) => [
    index('asignaturas_colegio_area_idx').on(t.colegioId, t.areaId),
    index('asignaturas_colegio_grado_idx').on(t.colegioId, t.gradoId),
  ],
);

/** Carga académica: qué docente enseña qué asignatura a qué grupo. */
export const docentesAsignaturasGrupos = pgTable(
  'docentes_asignaturas_grupos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    anioLectivoId: uuid('anio_lectivo_id')
      .notNull()
      .references(() => aniosLectivos.id, { onDelete: 'cascade' }),
    docenteId: uuid('docente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    asignaturaId: uuid('asignatura_id')
      .notNull()
      .references(() => asignaturas.id, { onDelete: 'restrict' }),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [
    unique('cargas_unique').on(t.anioLectivoId, t.docenteId, t.asignaturaId, t.grupoId),
    index('cargas_colegio_docente_idx').on(t.colegioId, t.docenteId),
    index('cargas_colegio_grupo_idx').on(t.colegioId, t.grupoId),
  ],
);

/**
 * matrículas — estudiante asignado a un grupo en un año lectivo.
 * Único por (año, estudiante): un estudiante pertenece a un solo grupo por año.
 */
export const matriculas = pgTable(
  'matriculas',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    anioLectivoId: uuid('anio_lectivo_id')
      .notNull()
      .references(() => aniosLectivos.id, { onDelete: 'cascade' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudiantes.id, { onDelete: 'restrict' }),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'restrict' }),
    fechaMatricula: date('fecha_matricula').notNull(),
    condicion: text('condicion', {
      enum: [
        CondicionMatricula.NUEVO,
        CondicionMatricula.ANTIGUO,
        CondicionMatricula.REPITENTE,
        CondicionMatricula.REINGRESO,
        CondicionMatricula.TRASLADADO,
      ],
    }).notNull(),
    estado: text('estado', { enum: ['INSCRITO', 'MATRICULADO', 'ANULADO', 'RETIRADO'] })
      .notNull()
      .default('MATRICULADO'),
    /** Se define al cerrar el año (Promociones). */
    situacionFinal: text('situacion_final', {
      enum: ['PROMOVIDO', 'NO_PROMOVIDO', 'RETIRADO', 'GRADUADO'],
    }),
    ...timestamps,
  },
  (t) => [
    unique('matriculas_anio_estudiante_unique').on(t.anioLectivoId, t.estudianteId),
    index('matriculas_colegio_grupo_idx').on(t.colegioId, t.grupoId),
  ],
);

export type AnioLectivo = typeof aniosLectivos.$inferSelect;
export type Periodo = typeof periodos.$inferSelect;
export type Grado = typeof grados.$inferSelect;
export type Grupo = typeof grupos.$inferSelect;
export type Area = typeof areas.$inferSelect;
export type Asignatura = typeof asignaturas.$inferSelect;
export type CargaAcademica = typeof docentesAsignaturasGrupos.$inferSelect;
export type Matricula = typeof matriculas.$inferSelect;
