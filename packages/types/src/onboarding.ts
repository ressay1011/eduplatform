/**
 * Onboarding del primer admin — contratos compartidos API ↔ web.
 *
 * Seis pasos: Colegio → Sedes y jornadas → Estructura → Personal → Estudiantes
 * → Resumen. El mínimo para finalizar es 1 sede con jornada + 1 curso; personal
 * y estudiantes pueden quedar pendientes (checklist «Completa tu colegio»).
 */
import { z } from 'zod';
import { anioLocal } from './fecha';
import { Calendario, Jornada } from './entities/enums';
import { esNitValido } from './nit';

const FECHA_ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD');
const JORNADAS = Object.values(Jornada) as [Jornada, ...Jornada[]];

/** Código DANE del establecimiento: 12 dígitos. */
export const CodigoDaneSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, 'El código DANE tiene 12 dígitos');

/** Período académico tal como llega del wizard (fechas ISO sin hora). */
export const PeriodoOnboardingSchema = z.object({
  numero: z.number().int().min(1).max(4),
  nombre: z.string().trim().min(3).max(40),
  fechaInicio: FECHA_ISO,
  fechaFin: FECHA_ISO,
});
export type PeriodoOnboardingRequest = z.input<typeof PeriodoOnboardingSchema>;

/**
 * Paso 1: identidad del colegio, calendario, año lectivo y períodos.
 *
 * NO incluye `dominioEmail`: el dominio con el que entran los usuarios se fija
 * una sola vez (con el dominio del correo del admin que configura el colegio) y
 * el wizard no lo edita. Cambiarlo dejaba a todos los usuarios fuera, porque el
 * login resuelve el colegio por el dominio del correo (ADR-006).
 */
export const ColegioOnboardingSchema = z
  .object({
    nombre: z.string().trim().min(3).max(160),
    /**
     * Nombre completo del establecimiento para documentos oficiales
     * (certificados, actas). Se prellena con el del MEN en mayúsculas y tildes
     * y el admin puede corregirlo, pero no puede quedar vacío: es la identidad
     * que se imprime, y el nombre corto se repite entre sedes y colegios.
     */
    nombreOficial: z
      .string()
      .trim()
      .min(3, 'Escribe el nombre oficial: es el que va en certificados y actas')
      .max(200),
    /**
     * NIT del colegio (opcional). La forma se valida aquí y no solo en el wizard:
     * un POST directo con «abc» responde 400. El dígito de verificación NO se
     * comprueba (ver `digitoVerificadorNit`): hay NIT reales sin él o con uno que
     * no cuadra, y rechazarlos bloquearía colegios ya registrados.
     */
    nit: z
      .string()
      .trim()
      .max(20)
      .refine((valor) => valor === '' || esNitValido(valor), {
        message:
          'NIT inválido: de 8 a 15 dígitos con el de verificación opcional, p. ej. 900123456-7',
      })
      .optional(),
    codigoDane: CodigoDaneSchema,
    municipio: z.string().trim().min(2).max(80),
    departamento: z.string().trim().min(2).max(80),
    direccion: z.string().trim().max(160).optional(),
    telefono: z.string().trim().max(30).optional(),
    email: z.string().trim().pipe(z.email().max(160)),
    calendario: z.enum([Calendario.A, Calendario.B]),
    /**
     * Jornadas que el MEN publica para el colegio. Se guardan al buscar el código
     * DANE y el wizard las propone en el paso de sedes (también tras recargar).
     */
    jornadasMen: z.array(z.enum(JORNADAS)).max(6).optional(),
    /**
     * Año lectivo del colegio. La ventana (anterior, actual y próximo) se valida
     * abajo, junto con las fechas de los períodos, porque depende del año en curso.
     */
    anioLectivo: z.number().int(),
    periodos: z.array(PeriodoOnboardingSchema).min(2).max(4),
  })
  /**
   * Reglas cruzadas del paso 1: ventana del año lectivo y fechas de los períodos.
   *
   * Son las mismas que aplica el wizard (año anterior, actual y próximo; períodos
   * dentro del lectivo —el calendario B cruza al año siguiente—, en orden y sin
   * solapes). Aquí se aplican también porque un cliente puede llamar a la API sin
   * pasar por el formulario.
   */
  .superRefine((valor, ctx) => {
    // Año del calendario del colegio, no el del servidor en UTC: el 31-dic a
    // partir de las 19:00 de Colombia la ventana se corría sola.
    const anioActual = anioLocal();
    if (Math.abs(valor.anioLectivo - anioActual) > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['anioLectivo'],
        message: `El año lectivo debe ser ${anioActual - 1}, ${anioActual} o ${anioActual + 1}`,
      });
      return;
    }

    const primerDia = `${valor.anioLectivo}-01-01`;
    // El calendario B arranca en septiembre y cierra en junio del año siguiente.
    const ultimoDia = `${valor.anioLectivo + 1}-12-31`;
    let finAnterior: string | null = null;

    valor.periodos.forEach((periodo, indice) => {
      if (periodo.fechaInicio < primerDia) {
        ctx.addIssue({
          code: 'custom',
          path: ['periodos', indice, 'fechaInicio'],
          message: `El período no puede empezar antes del año lectivo (${valor.anioLectivo})`,
        });
      }
      if (periodo.fechaFin > ultimoDia) {
        ctx.addIssue({
          code: 'custom',
          path: ['periodos', indice, 'fechaFin'],
          message: `El período no puede terminar después de ${valor.anioLectivo + 1}`,
        });
      }
      if (periodo.fechaInicio >= periodo.fechaFin) {
        ctx.addIssue({
          code: 'custom',
          path: ['periodos', indice, 'fechaFin'],
          message: 'El inicio del período debe ser anterior al fin',
        });
      }
      if (finAnterior !== null && periodo.fechaInicio <= finAnterior) {
        ctx.addIssue({
          code: 'custom',
          path: ['periodos', indice, 'fechaInicio'],
          message: 'El período se cruza con el anterior',
        });
      }
      finAnterior = periodo.fechaFin;
    });
  });
export type ColegioOnboardingRequest = z.input<typeof ColegioOnboardingSchema>;

/** Paso 2: sede con las jornadas que ofrece. */
export const SedeOnboardingSchema = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  codigoDaneSede: z.string().trim().max(20).optional(),
  direccion: z.string().trim().max(160).optional(),
  /** Municipio de la sede: puede no ser el del colegio. */
  municipio: z.string().trim().max(80).optional(),
  departamento: z.string().trim().max(80).optional(),
  jornadas: z.array(z.enum(JORNADAS)).min(1, 'Elige al menos una jornada').max(6),
});
export type SedeOnboardingRequest = z.input<typeof SedeOnboardingSchema>;

/** Paso 3: generador de cursos (producto cartesiano grados × letras). */
export const EstructuraOnboardingSchema = z.object({
  sedeId: z.uuid(),
  jornada: z.enum(JORNADAS),
  grados: z.array(z.number().int().min(0).max(11)).min(1).max(12),
  letras: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[A-Z]$/, 'La letra es una sola mayúscula'),
    )
    .min(1)
    .max(10),
});
export type EstructuraOnboardingRequest = z.input<typeof EstructuraOnboardingSchema>;

/**
 * Datos del establecimiento que devuelve la consulta por código DANE
 * (datos abiertos del MEN). Son una SUGERENCIA para el paso 1: el admin revisa
 * y corrige antes de guardar. `anio` es el año del dato, no el año lectivo.
 */
export interface ColegioDane {
  codigoDane: string;
  /** Año del reporte del MEN (los datos llegan con ~1 año de rezago). */
  anio: number;
  nombre: string;
  municipio: string;
  departamento: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  calendario: Calendario;
  /** OFICIAL / NO OFICIAL. */
  sector: string | null;
  /** Académico / Técnico. */
  caracter: string | null;
  rector: string | null;
  matricula: number;
  sedes: number;
  /**
   * Jornadas que el MEN publica para el establecimiento. Llegan vacías cuando
   * el dataset no lo tiene: son una sugerencia para el paso 2, no un requisito.
   */
  jornadas: Jornada[];
}

/** Sede tal como la devuelve la API. */
export interface SedeOnboarding {
  id: string;
  nombre: string;
  codigoDaneSede: string | null;
  direccion: string | null;
  /** Municipio y departamento de la sede (pueden diferir de los del colegio). */
  municipio: string;
  departamento: string;
  jornadas: Jornada[];
}

export interface PeriodoOnboarding {
  numero: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

export interface ColegioOnboarding {
  id: string;
  nombre: string;
  /** Nombre completo del MEN para certificados y actas (NULL en colegios viejos). */
  nombreOficial: string | null;
  nit: string | null;
  codigoDane: string;
  municipio: string;
  departamento: string;
  direccion: string | null;
  telefono: string | null;
  email: string;
  calendario: Calendario;
  /** Jornadas que el MEN publica para el colegio (sugerencia del paso de sedes). */
  jornadasMen: Jornada[];
}

export interface AnioLectivoOnboarding {
  id: string;
  anio: number;
  fechaInicio: string;
  fechaFin: string;
}

/** Ítem del checklist «Completa tu colegio» (dashboard y paso 6). */
export interface ChecklistOnboardingItem {
  clave: string;
  titulo: string;
  detalle: string;
  hecho: boolean;
}

/** Estado completo del wizard: una sola llamada alimenta los 6 pasos. */
export interface EstadoOnboarding {
  completado: boolean;
  paso: number;
  /**
   * Año en curso según el SERVIDOR (`hoyLocal`, America/Bogota). El wizard lo usa
   * para proponer el año lectivo y sus períodos: si saliera del reloj del equipo,
   * uno con la zona o la fecha mal propondría un año que la API rechaza.
   */
  anioActual: number;
  colegio: ColegioOnboarding;
  sedes: SedeOnboarding[];
  anioLectivo: AnioLectivoOnboarding | null;
  periodos: PeriodoOnboarding[];
  estructura: { grados: number; cursos: number };
  personal: { total: number };
  estudiantes: { total: number; matriculados: number };
  checklist: ChecklistOnboardingItem[];
}

/** Resultado de finalizar (el mínimo no cumplido se explica con 409). */
export interface ResultadoOnboarding {
  completado: boolean;
  estado: EstadoOnboarding;
}
