/**
 * Documentos: plantillas de certificados/boletines y certificados emitidos.
 * Los certificados llevan un código único para verificación pública.
 *
 * Datos legales obligatorios en toda plantilla (Secretarías de Educación):
 * nombre de la IE, DANE, resolución de aprobación, naturaleza, escala
 * nacional (D.1290 art. 4), firmas de rector y secretario.
 */

import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { TipoCertificado } from '@eduplatform/types';
import { colegios } from './colegios';
import { usuarios } from './usuarios';
import { estudiantes } from './estudiantes';
import { aniosLectivos } from './estructura';
import { timestamps } from './_tenant';

/** Plantillas con variables {{nombre}}, {{grado}}, etc. — editables por el colegio. */
export const plantillasCertificados = pgTable(
  'plantillas_certificados',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'cascade' }),
    tipo: text('tipo', {
      enum: [
        TipoCertificado.MATRICULA,
        TipoCertificado.ESTUDIO,
        TipoCertificado.PROMOCION,
        TipoCertificado.CONSTANCIA,
        TipoCertificado.BOLETIN,
      ],
    }).notNull(),
    nombre: text('nombre').notNull(),
    contenidoHtml: text('contenido_html').notNull(),
    activa: boolean('activa').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('plantillas_colegio_tipo_idx').on(t.colegioId, t.tipo)],
);

/** Certificados emitidos — `codigo_verificacion` es público (URL de verificación). */
export const certificados = pgTable(
  'certificados',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    colegioId: uuid('colegio_id')
      .notNull()
      .references(() => colegios.id, { onDelete: 'restrict' }),
    plantillaId: uuid('plantilla_id')
      .notNull()
      .references(() => plantillasCertificados.id, { onDelete: 'restrict' }),
    estudianteId: uuid('estudiante_id')
      .notNull()
      .references(() => estudiantes.id, { onDelete: 'restrict' }),
    anioLectivoId: uuid('anio_lectivo_id').references(() => aniosLectivos.id, {
      onDelete: 'set null',
    }),
    codigoVerificacion: text('codigo_verificacion').notNull().unique(),
    /** Folio/consecutivo llevado por el colegio (nullable). */
    consecutivo: text('consecutivo'),
    generadoPorId: uuid('generado_por_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    fechaGeneracion: timestamp('fecha_generacion', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    /** Ruta del PDF en almacenamiento (R2/S3). */
    pdfUrl: text('pdf_url'),
    ...timestamps,
  },
  (t) => [
    index('certificados_colegio_estudiante_idx').on(t.colegioId, t.estudianteId),
    index('certificados_colegio_fecha_idx').on(t.colegioId, t.fechaGeneracion),
  ],
);

export type PlantillaCertificado = typeof plantillasCertificados.$inferSelect;
export type Certificado = typeof certificados.$inferSelect;
