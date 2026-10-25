/**
 * Contratos del módulo Matrículas — estudiante ↔ curso ↔ año lectivo.
 *
 * La tabla `matriculas` ya existe en el modelo de datos (SIMAT): un estudiante
 * tiene UNA matrícula por año lectivo (`UNIQUE (anio_lectivo_id, estudiante_id)`).
 * El estado sigue los valores del modelo (`INSCRITO | MATRICULADO | ANULADO |
 * RETIRADO`); la baja es un cambio a RETIRADO, nunca un borrado físico.
 *
 * El módulo matricula estudiantes que YA tienen cuenta (`usuarios` + ficha en
 * `estudiantes`); el alta masiva de cuentas es otro módulo. El CSV del paso 5
 * del onboarding solo crea la ficha del estudiante cuando la cuenta existe y
 * la fila trae `fechaNacimiento`.
 */
import { z } from 'zod';
import { CondicionMatricula, Jornada } from './entities/enums';

const FECHA_ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD');

/** Estados de la matrícula (espejo del enum de BD / SIMAT). */
export const ESTADOS_MATRICULA = ['INSCRITO', 'MATRICULADO', 'ANULADO', 'RETIRADO'] as const;
export const EstadoMatriculaSchema = z.enum(ESTADOS_MATRICULA);
export type EstadoMatricula = (typeof ESTADOS_MATRICULA)[number];

/** Condiciones de ingreso del estudiante al curso. */
export const CONDICIONES_MATRICULA = [
  CondicionMatricula.NUEVO,
  CondicionMatricula.ANTIGUO,
  CondicionMatricula.REPITENTE,
  CondicionMatricula.REINGRESO,
  CondicionMatricula.TRASLADADO,
] as const;
export const CondicionMatriculaSchema = z.enum(CONDICIONES_MATRICULA);

/** Curso (grupo) resoluble del año lectivo vigente. */
export interface CursoMatricula {
  id: string;
  /** Etiqueta corta lista para la UI: «6° A». */
  nombre: string;
  /** 0 = Transición. */
  grado: number;
  letra: string;
  jornada: Jornada;
  sedeId: string;
  sedeNombre: string;
  anioLectivoId: string;
  anio: number;
}

/** POST /api/matriculas — alta individual de un estudiante existente. */
export const CrearMatriculaSchema = z.object({
  estudianteId: z.string().uuid('Estudiante inválido'),
  cursoId: z.string().uuid('Curso inválido'),
  condicion: CondicionMatriculaSchema.default(CondicionMatricula.NUEVO),
  fechaMatricula: FECHA_ISO.optional(),
});
export type CrearMatriculaRequest = z.input<typeof CrearMatriculaSchema>;
/** Datos ya validados (con `condicion` resuelta por el default). */
export type CrearMatriculaDatos = z.output<typeof CrearMatriculaSchema>;

/**
 * Fila del CSV de matrícula (paso 5 del onboarding).
 *
 * `nombres`, `apellidos` y `correo` son informativos: la fuente de verdad es la
 * cuenta que ya existe. `fechaNacimiento` solo se exige cuando el estudiante
 * todavía no tiene ficha en `estudiantes`.
 */
export const FilaMatriculaSchema = z.object({
  documento: z.string().trim().min(4, 'Documento inválido').max(20),
  nombres: z.string().trim().max(120).optional(),
  apellidos: z.string().trim().max(120).optional(),
  correo: z.string().trim().max(160).optional(),
  sede: z.string().trim().min(1, 'Falta la sede').max(120),
  grado: z.string().trim().min(1, 'Falta el grado').max(12),
  letra: z.string().trim().min(1, 'Falta la letra').max(2),
  jornada: z.string().trim().min(1, 'Falta la jornada').max(20),
  fechaNacimiento: FECHA_ISO.optional(),
});
export type FilaMatriculaRequest = z.input<typeof FilaMatriculaSchema>;

/** POST /api/matriculas/importar — todas o nada POR FILA (las válidas se crean). */
export const ImportarMatriculasSchema = z.object({
  filas: z.array(FilaMatriculaSchema).min(1, 'Envía al menos una fila').max(500),
});
export type ImportarMatriculasRequest = z.input<typeof ImportarMatriculasSchema>;

export interface ErrorImportacionMatricula {
  /** Posición 1-based dentro del arreglo `filas` enviado. */
  fila: number;
  motivo: string;
}

export interface ResultadoImportacionMatriculas {
  creadas: number;
  errores: ErrorImportacionMatricula[];
}

/** Query de GET /api/matriculas. */
export const ListarMatriculasQuerySchema = z.object({
  cursoId: z.string().uuid('Curso inválido').optional(),
  anioLectivoId: z.string().uuid('Año inválido').optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListarMatriculasQuery = z.output<typeof ListarMatriculasQuerySchema>;

/** Matrícula tal como la entrega la API (con el estudiante y su curso). */
export interface MatriculaListado {
  id: string;
  estudianteId: string;
  nombres: string;
  apellidos: string;
  numeroDocumento: string;
  cursoId: string;
  /** «6° A». */
  curso: string;
  sede: string;
  jornada: Jornada;
  anio: number;
  estado: EstadoMatricula;
  condicion: CondicionMatricula;
  fechaMatricula: string;
}

export interface ListaMatriculas {
  items: MatriculaListado[];
  total: number;
  page: number;
  limit: number;
}

export interface MatriculaCreada {
  id: string;
}
