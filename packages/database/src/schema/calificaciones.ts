/**
 * Calificaciones: evaluaciones, notas por estudiante, nota final de período
 * y resultado de promoción del año (Decreto 1290 arts. 5-8).
 *
 * Cierre de períodos: cron por fechas (ADR-003). La nota final puede quedar
 * en null ("Sin calificar") si el período cierra con notas faltantes —
 * el boletín lo reporta como tal.
 */

import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { NivelDesempeno, TipoCierre } from '@eduplatform/types';
import { colegios } from './colegios';
import { usuarios } from './usuarios';
import { estudiantes } from './estudiantes';
import { aniosLectivos, areas, asignaturas, grados, grupos, periodos } from './estructura';
import { timestamps } from './_tenant';

/** Evaluaciones — actividad de evaluación con peso % dentro del período. */
export const evaluaciones = pgTable(
  'evaluaciones',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    periodoId: uuid('periodo_id')
      .notNull()
      .references(() => periodos.id, { onDelete: 'restrict' }),
    asignaturaId: uuid('asignatura_id')
      .notNull()
      .references(() => asignaturas.id, { onDelete: 'restrict' }),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'restrict' }),
    docenteId: uuid('docente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    nombre: text('nombre').notNull(),
    /** Peso de la evaluación dentro del período (0–100). */
    porcentaje: smallint('porcentaje').notNull(),
    fecha: date('fecha'),
    descripcion: text('descripcion'),
    ...timestamps,
  },
  (t) => [
    index('evaluaciones_colegio_periodo_idx').on(t.colegioId, t.periodoId),
    index('evaluaciones_carga_idx').on(t.colegioId, t.periodoId, t.asignaturaId, t.grupoId),
  ],
);

/** Nota de un estudiante en una evaluación concreta (rango según SIEE). */
export const calificaciones = pgTable(
  'calificaciones',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    evaluacionId: uuid('evaluacion_id')
      .notNull()
      .references(() => evaluaciones.id, { onDelete: 'cascade' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudiantes.id, { onDelete: 'cascade' }),
    /** null = "sin calificar" (el docente aún no la registra). */
    nota: numeric('nota', { precision: 4, scale: 2 }),
    observacion: text('observacion'),
    registradaPorId: uuid('registrada_por_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    unique('calificaciones_unique').on(t.evaluacionId, t.estudianteId),
    index('calificaciones_colegio_estudiante_idx').on(t.colegioId, t.estudianteId),
  ],
);

/**
 * notas_periodo — nota final consolidada por estudiante / área / período.
 * Agregación según `configuracion_colegio.valoracion_por` (AREA o ASIGNATURA).
 * la escribe SOLO el cierre (cron o manual con permisos).
 */
export const notasPeriodo = pgTable(
  'notas_periodo',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    periodoId: uuid('periodo_id')
      .notNull()
      .references(() => periodos.id, { onDelete: 'restrict' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudiantes.id, { onDelete: 'cascade' }),
    /** null cuando el colegio valora por ÁREA. */
    asignaturaId: uuid('asignatura_id').references(() => asignaturas.id, { onDelete: 'restrict' }),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'restrict' }),
    /** null = "Sin calificar" (período cerrado con notas faltantes). */
    notaFinal: numeric('nota_final', { precision: 4, scale: 2 }),
    /** null en el caso "Sin calificar" (D.1290 exige nivel si hay nota). */
    nivelDesempeno: text('nivel_desempeno', {
      enum: [
        NivelDesempeno.SUPERIOR,
        NivelDesempeno.ALTO,
        NivelDesempeno.BASICO,
        NivelDesempeno.BAJO,
      ],
    }),
    /** Logros/desempeños del período (aparece en la boleta). */
    logros: text('logros'),
    dificultades: text('dificultades'),
    /** Inasistencias del período en esa área/asignatura. */
    fallas: integer('fallas').notNull().default(0),
    /** Nota de habilitación/recuperación (si aplica). */
    recuperacionNota: numeric('recuperacion_nota', { precision: 4, scale: 2 }),
    cerradaEn: timestamp('cerrada_en', { withTimezone: true, mode: 'date' }),
    /** null = cierre automático (cron); usuario si fue manual. */
    cerradaPorId: uuid('cerrada_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    tipoCierre: text('tipo_cierre', {
      enum: [TipoCierre.AUTOMATICO, TipoCierre.MANUAL_ANTICIPADO, TipoCierre.MANUAL_REAPERTURA],
    }),
    /** Veces que se ha reabierto (auditoría; ventana configurable post-cierre). */
    reabiertasCount: integer('reabiertas_count').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique('notas_periodo_unique').on(t.periodoId, t.estudianteId, t.areaId, t.asignaturaId),
    index('notas_periodo_colegio_periodo_idx').on(t.colegioId, t.periodoId),
    index('notas_periodo_colegio_estudiante_idx').on(t.colegioId, t.estudianteId),
  ],
);

/**
 * promociones — resultado final del año (D.1290 arts. 6-8):
 *   1–2 áreas en Bajo → PENDIENTE (derecho a recuperación);
 *   3+ áreas en Bajo → NO_PROMOVIDO; art. 7 → PROMOVIDO_ANTICIPADO.
 */
export const promociones = pgTable(
  'promociones',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    anioLectivoId: uuid('anio_lectivo_id')
      .notNull()
      .references(() => aniosLectivos.id, { onDelete: 'restrict' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudiantes.id, { onDelete: 'cascade' }),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'restrict' }),
    promedioFinal: numeric('promedio_final', { precision: 4, scale: 2 }).notNull(),
    areasReprobadas: integer('areas_reprobadas').notNull(),
    resultado: text('resultado', {
      enum: ['PROMOVIDO', 'PENDIENTE', 'NO_PROMOVIDO', 'PROMOVIDO_ANTICIPADO'],
    }).notNull(),
    gradoDestinoId: uuid('grado_destino_id').references(() => grados.id, { onDelete: 'set null' }),
    /** Referencia al acta del Consejo Directivo (solo promoción anticipada). */
    actaPromocionAnticipada: text('acta_promocion_anticipada'),
    ...timestamps,
  },
  (t) => [unique('promociones_unique').on(t.anioLectivoId, t.estudianteId)],
);

export type Evaluacion = typeof evaluaciones.$inferSelect;
export type Calificacion = typeof calificaciones.$inferSelect;
export type NotaPeriodo = typeof notasPeriodo.$inferSelect;
export type Promocion = typeof promociones.$inferSelect;