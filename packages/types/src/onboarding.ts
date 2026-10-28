/**
 * Onboarding del primer admin — contratos compartidos API ↔ web.
 *
 * Seis pasos: Colegio → Sedes y jornadas → Estructura → Personal → Estudiantes
 * → Resumen. El mínimo para finalizar es 1 sede con jornada + 1 curso; personal
 * y estudiantes pueden quedar pendientes (checklist «Completa tu colegio»).
 */
import { z } from 'zod';
import { SubdominioSchema } from './auth';
import { Calendario, Jornada } from './entities/enums';

const FECHA_ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD');
const JORNADAS = Object.values(Jornada) as [Jornada, ...Jornada[]];

/** Código DANE del establecimiento: 12 dígitos (ver `subdominioDeNombre` abajo). */
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
export const ColegioOnboardingSchema = z.object({
  nombre: z.string().trim().min(3).max(160),
  /**
   * Nombre completo del establecimiento para documentos oficiales (certificados,
   * actas). Se prellena con el del MEN en mayúsculas y tildes; el admin puede
   * corregirlo. Sin él, los documentos usan `nombre`.
   */
  nombreOficial: z.string().trim().max(200).optional(),
  nit: z.string().trim().max(20).optional(),
  codigoDane: CodigoDaneSchema,
  subdominio: SubdominioSchema,
  municipio: z.string().trim().min(2).max(80),
  departamento: z.string().trim().min(2).max(80),
  direccion: z.string().trim().max(160).optional(),
  telefono: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(160),
  calendario: z.enum([Calendario.A, Calendario.B]),
  anioLectivo: z.number().int().min(2020).max(2100),
  periodos: z.array(PeriodoOnboardingSchema).min(2).max(4),
});
export type ColegioOnboardingRequest = z.input<typeof ColegioOnboardingSchema>;

/**
 * Subdominio sugerido a partir del nombre del colegio.
 *
 * Quita tildes y puntos (para que «I.E.T.D.» no quede como `i-e-t-d-`), pasa a
 * minúsculas, convierte el resto de separadores en guiones y recorta a 32
 * caracteres — el máximo de `SubdominioSchema`. Devuelve `''` si no alcanza el
 * mínimo de 3, y en ese caso la web deja el campo vacío para que lo escriba el
 * admin. Es solo una SUGERENCIA: el campo siempre queda editable.
 */
export function subdominioDeNombre(nombre: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tildes y diéresis
    .replace(/\./g, '') // «I.E.» → «IE»
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return base.length >= 3 ? base : '';
}

/** Paso 2: sede con las jornadas que ofrece. */
export const SedeOnboardingSchema = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  codigoDaneSede: z.string().trim().max(20).optional(),
  direccion: z.string().trim().max(160).optional(),
  jornadas: z.array(z.enum(JORNADAS)).min(1, 'Elige al menos una jornada').max(5),
});
export type SedeOnboardingRequest = z.input<typeof SedeOnboardingSchema>;

/** Paso 3: generador de cursos (producto cartesiano grados × letras). */
export const EstructuraOnboardingSchema = z.object({
  sedeId: z.string().uuid(),
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
}

/** Sede tal como la devuelve la API. */
export interface SedeOnboarding {
  id: string;
  nombre: string;
  codigoDaneSede: string | null;
  direccion: string | null;
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
  subdominio: string;
  /** Dominio del correo institucional: solo lectura en el wizard. */
  dominioEmail: string | null;
  municipio: string;
  departamento: string;
  direccion: string | null;
  telefono: string | null;
  email: string;
  calendario: Calendario;
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
