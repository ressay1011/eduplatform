/**
 * Núcleo multi-tenant: colegios (el tenant), su configuración (SIEE) y sedes.
 * `colegios` es la raíz del modelo: todas las demás tablas cuelgan de ella.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { Calendario, EstadoColegio, type Jornada, type PaletaColegio } from '@eduplatform/types';
import { timestamps, softDelete } from './_tenant';

/**
 * Estructura por defecto de niveles de desempeño (Decreto 1290 art. 5).
 * Cada colegio puede personalizarlo en `configuracion_colegio.niveles_desempeno`.
 */
export const DEFAULT_NIVELES_DESEMPENO = {
  SUPERIOR: { min: 4.6, max: 5.0, label: 'Desempeño Superior' },
  ALTO: { min: 4.0, max: 4.5, label: 'Desempeño Alto' },
  BASICO: { min: 3.0, max: 3.9, label: 'Desempeño Básico' },
  BAJO: { min: 1.0, max: 2.9, label: 'Desempeño Bajo' },
} as const;

export const colegios = pgTable(
  'colegios',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nombre: text('nombre').notNull().default(''),
    /**
     * Nombre completo del establecimiento tal como lo registra el MEN
     * («INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL …»). Es el que se imprime en
     * certificados, actas y diplomas; `nombre` es el nombre corto de la UI.
     */
    nombreOficial: text('nombre_oficial'),
    /** NIT — nullable: algunos colegios públicos no lo reportan. */
    nit: text('nit').unique(),
    /** Código DANE oficial de la IE (12 dígitos, único a nivel nacional). */
    // Sin DANE el colegio se crea igual; el wizard lo exige en el paso 1.
    codigoDane: text('codigo_dane').unique(),
    /**
     * Código estable del colegio: arma los usuarios (`admin@juanaArias`) y es lo
     * que el login usa para resolver el tenant. Lo crea el administrador de
     * plataforma y **nunca** se edita; la caja no distingue (`lower()` único).
     */
    codigo: text('codigo').notNull(),
    /**
     * Dominio de correo institucional (p. ej. `juanaarias.edu.co`).
     * Único: el login unificado lo usa para saber a qué colegio entra el usuario.
     */
    municipio: text('municipio').notNull().default(''),
    departamento: text('departamento').notNull().default(''),
    direccion: text('direccion'),
    telefono: text('telefono'),
    email: text('email').notNull().default(''),
    /**
     * Jornadas que el MEN publica para el establecimiento. El wizard las usa
     * como sugerencia del paso de sedes; no son la configuración del colegio.
     */
    jornadasMen: text('jornadas_men').array(),
    logoUrl: text('logo_url'),
    /** Calendario A (feb–nov) o B (sep–jun). */
    calendario: text('calendario', { enum: [Calendario.A, Calendario.B] })
      .notNull()
      .default(Calendario.A),
    estado: text('estado', {
      enum: [EstadoColegio.ACTIVO, EstadoColegio.SUSPENDIDO, EstadoColegio.PRUEBA],
    })
      .notNull()
      .default(EstadoColegio.PRUEBA),
    plan: text('plan', { enum: ['BASICO', 'COMPLETO'] })
      .notNull()
      .default('BASICO'),
    /** Override del color semilla Material Design 3 por colegio (hex). */
    primaryColor: text('primary_color'),
    /** Segunda y tercera semilla de la paleta del colegio (hex). */
    secondaryColor: text('secondary_color'),
    tertiaryColor: text('tertiary_color'),
    /**
     * Paleta resuelta (claro y oscuro) calculada desde las tres semillas.
     * Se guarda ya calculada; ver `PaletaColegio` en @eduplatform/types.
     */
    palette: jsonb('palette').$type<PaletaColegio>(),
    /**
     * Wizard de configuración inicial: paso 1..6 mientras está en curso.
     * Se guarda para poder reanudar («Guardar y salir»).
     */
    onboardingPaso: smallint('onboarding_paso').notNull().default(1),
    /** null hasta que el admin termina el wizard (mínimo: sede + jornada + curso). */
    onboardingCompletadoEn: timestamp('onboarding_completado_en', {
      withTimezone: true,
      mode: 'date',
    }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('colegios_estado_idx').on(t.estado)],
);

/**
 * Configuración del colegio (1:1) — el SIEE del Decreto 1290 art. 4:
 * escala de valoración, niveles de desempeño, reglas de promoción, firmas
 * de certificados, resolución oficial, módulo de asistencia, etc.
 */
export const configuracionColegio = pgTable('configuracion_colegio', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  colegioId: uuid('colegio_id')
    .notNull()
    .unique()
    .references(() => colegios.id, { onDelete: 'cascade' }),
  escalaNumericaMin: numeric('escala_numerica_min', { precision: 3, scale: 1 })
    .notNull()
    .default('1.0'),
  escalaNumericaMax: numeric('escala_numerica_max', { precision: 3, scale: 1 })
    .notNull()
    .default('5.0'),
  notaAprobatoria: numeric('nota_aprobatoria', { precision: 3, scale: 1 }).notNull().default('3.0'),
  /** 2, 3 o 4 períodos por año (normativa permite los tres). */
  periodosPorAnio: integer('periodos_por_anio').notNull().default(4),
  /** Rangos editables de niveles de desempeño (D.1290 art. 5). */
  nivelesDesempeno: jsonb('niveles_desempeno')
    .$type<typeof DEFAULT_NIVELES_DESEMPENO>()
    .notNull()
    .default(sql`'${sql.raw(JSON.stringify(DEFAULT_NIVELES_DESEMPENO))}'::jsonb`),
  /** AREA (recomendado D.1290) o ASIGNATURA — cómo reporta el colegio. */
  valoracionPor: text('valoracion_por', { enum: ['AREA', 'ASIGNATURA'] })
    .notNull()
    .default('AREA'),
  /** % máximo de inasistencia (lo define el SIEE; default 25). */
  porcentajeInasistenciaMax: integer('porcentaje_inasistencia_max').notNull().default(25),
  /** Lista diaria opcional (v1.1) — si está activa alimenta el conteo de fallas. */
  moduloAsistenciaActivo: boolean('modulo_asistencia_activo').notNull().default(false),
  /** Áreas reprobadas que admiten recuperación antes de no promover (D.1290). */
  areasReprobadasMaxRecuperacion: integer('areas_reprobadas_max_recuperacion').notNull().default(2),
  /** Firmas obligatorias en certificados (rector, secretario académico). */
  firmasCertificados: jsonb('firmas_certificados').$type<{
    rector?: string;
    secretario?: string;
  }>(),
  /** Resolución oficial de aprobación (aparece en certificados). */
  resolucionAprobacion: text('resolucion_aprobacion'),
  /** Naturaleza de la IE — siempre OFICIAL para colegios públicos. */
  naturaleza: text('naturaleza').notNull().default('OFICIAL'),
  ...timestamps,
});

/**
 * Sedes — una IE puede tener varias sedes, cada una con su propio DANE.
 */
export const sedes = pgTable(
  'sedes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    codigoDaneSede: text('codigo_dane_sede'),
    direccion: text('direccion'),
    /**
     * Ubicación de la sede. Una IE puede tener sedes en otro municipio; vacío
     * significa «la del colegio».
     */
    municipio: text('municipio').notNull().default(''),
    departamento: text('departamento').notNull().default(''),
    activa: boolean('activa').notNull().default(true),
    /**
     * Jornadas que ofrece la sede (Mañana/Tarde/Noche/Única/Sabatina).
     * Cada curso elige una de estas; una sede sin jornadas no puede tener cursos.
     */
    jornadas: jsonb('jornadas')
      .$type<Jornada[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('sedes_colegio_id_idx').on(t.colegioId)],
);

export type Colegio = typeof colegios.$inferSelect;
export type NewColegio = typeof colegios.$inferInsert;
export type ConfiguracionColegio = typeof configuracionColegio.$inferSelect;
export type Sede = typeof sedes.$inferSelect;
export type NewSede = typeof sedes.$inferInsert;
