/**
 * Contratos del módulo Personas → Roles.
 *
 * Un rol pertenece al colegio, agrupa permisos del catálogo global y declara
 * en qué pestaña de Personas se lista la gente que lo tiene (`tipoPersona`).
 * El admin del colegio (`esAdmin`) no es un rol asignable.
 */
import { z } from 'zod';
import { PermisoCodigoSchema } from './usuarios';

/** Pestaña del módulo Personas a la que pertenece un rol. */
export const TIPOS_PERSONA_ROL = ['EMPLEADO', 'ESTUDIANTE', 'ACUDIENTE'] as const;
export const TipoPersonaRolSchema = z.enum(TIPOS_PERSONA_ROL);
export type TipoPersonaRol = (typeof TIPOS_PERSONA_ROL)[number];

/** Alcance de una persona sobre las sedes del colegio. */
export const ALCANCES = ['TODAS', 'ESPECIFICAS'] as const;
export const AlcanceSchema = z.enum(ALCANCES);
export type Alcance = (typeof ALCANCES)[number];

export const NombreRolSchema = z.string().trim().min(2, 'Mínimo 2 caracteres').max(60);
export const DescripcionRolSchema = z.string().trim().max(200);

/** POST /roles */
export const CrearRolSchema = z.object({
  nombre: NombreRolSchema,
  descripcion: DescripcionRolSchema.optional(),
  tipoPersona: TipoPersonaRolSchema.default('EMPLEADO'),
  permisos: z.array(PermisoCodigoSchema).max(100).default([]),
});
export type CrearRolRequest = z.input<typeof CrearRolSchema>;

/** PATCH /roles/:id — cambios parciales (incluye activar/desactivar). */
export const ActualizarRolSchema = z
  .object({
    nombre: NombreRolSchema.optional(),
    descripcion: DescripcionRolSchema.nullable().optional(),
    tipoPersona: TipoPersonaRolSchema.optional(),
    permisos: z.array(PermisoCodigoSchema).max(100).optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Envía al menos un campo para actualizar',
    path: [],
  });
export type ActualizarRolRequest = z.input<typeof ActualizarRolSchema>;

/** Rol tal como lo entrega la API. */
export interface RolListado {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipoPersona: TipoPersonaRol;
  esPredeterminado: boolean;
  activo: boolean;
  /** Códigos `modulo.accion` que otorga el rol. */
  permisos: string[];
  /** Personas activas con este rol (bloquea el borrado si > 0). */
  personas: number;
}

export interface ListaRoles {
  items: RolListado[];
}

/** Sede asignada a una persona (alcance ESPECIFICAS). */
export interface SedeAsignada {
  id: string;
  nombre: string;
}

/** Persona de la pestaña Empleados (cuenta del colegio con su rol). */
export interface PersonaEmpleado {
  id: string;
  nombres: string;
  apellidos: string;
  usuario: string;
  tipoDocumento: string | null;
  numeroDocumento: string;
  esAdmin: boolean;
  activo: boolean;
  rolId: string | null;
  rolNombre: string | null;
  alcance: Alcance;
  sedes: SedeAsignada[];
  ultimoAcceso: string | null;
}

/** Persona de la pestaña Estudiantes. */
export interface PersonaEstudiante {
  id: string;
  usuarioId: string;
  nombres: string;
  apellidos: string;
  numeroDocumento: string;
  usuario: string;
  codigoMatricula: string;
  estado: string;
  curso: string | null;
  /** Acudiente principal (nombre completo) si ya está vinculado. */
  acudiente: string | null;
  activo: boolean;
}

/** Persona de la pestaña Acudientes, con sus estudiantes a cargo. */
export interface PersonaAcudiente {
  id: string;
  nombres: string;
  apellidos: string;
  numeroDocumento: string;
  usuario: string;
  /** Teléfono declarado en el vínculo con el estudiante (si lo hay). */
  telefono: string | null;
  activo: boolean;
  estudiantes: string[];
}

export interface ListaPersonas<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Query común de los listados de Personas. */
export const ListarPersonasQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
// zod 4: `z.coerce.number()` tiene input `unknown`; ya se trabaja con los
// valores parseados (defaults aplicados), así que el tipo es el de salida.
export type ListarPersonasQuery = z.output<typeof ListarPersonasQuerySchema>;
