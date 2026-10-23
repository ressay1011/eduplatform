/**
 * Contratos del módulo Usuarios (personal del colegio).
 * Compartidos entre API (validación Zod) y web (formularios).
 *
 * ADR-003: NO hay roles fijos. `esAdmin` es el único rol (todos los permisos);
 * el resto recibe permisos individuales del catálogo.
 */
import { z } from 'zod';
import { EmailSchema } from './auth';
import { TipoDocumento } from './entities/enums';

/** Valores válidos de tipo de documento (espejo del enum de BD). */
export const TIPOS_DOCUMENTO = [
  TipoDocumento.CC,
  TipoDocumento.TI,
  TipoDocumento.CE,
  TipoDocumento.RC,
  TipoDocumento.PEP,
  TipoDocumento.PPT,
] as const;

/** Código de permiso del catálogo: `modulo.accion` (p. ej. `usuarios.crear`). */
export const PermisoCodigoSchema = z
  .string()
  .trim()
  .regex(/^[a-z]+(?:\.[a-z_]+)+$/, 'Código de permiso inválido');

/** Datos personales editables del usuario. */
const DatosPersonalesSchema = z.object({
  nombres: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  apellidos: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120),
  email: EmailSchema,
  tipoDocumento: z.enum(TIPOS_DOCUMENTO),
  numeroDocumento: z
    .string()
    .trim()
    .min(4, 'Mínimo 4 caracteres')
    .max(20)
    .regex(/^[0-9A-Za-z-]+$/, 'Solo números, letras y guiones'),
});

/** POST /usuarios — crear cuenta con contraseña temporal. */
export const CrearUsuarioSchema = DatosPersonalesSchema.extend({
  esAdmin: z.boolean().default(false),
  /** Rol único de la persona (módulo Personas). Si viene, manda sobre `permisos`. */
  rolId: z.string().uuid('Rol inválido').nullable().optional(),
  permisos: z.array(PermisoCodigoSchema).max(100).default([]),
  /** Alcance sobre sedes: TODAS o las listadas en `sedesIds`. */
  alcance: z.enum(['TODAS', 'ESPECIFICAS']).default('TODAS'),
  sedesIds: z.array(z.string().uuid('Sede inválida')).max(50).default([]),
})
  .refine((datos) => datos.esAdmin || datos.rolId != null || datos.permisos.length > 0, {
    message: 'Asigna un rol, al menos un permiso, o marca la cuenta como admin',
    path: ['rolId'],
  })
  .refine((datos) => datos.alcance === 'TODAS' || datos.sedesIds.length > 0, {
    message: 'Elige al menos una sede para el alcance específico',
    path: ['sedesIds'],
  });
export type CrearUsuarioRequest = z.input<typeof CrearUsuarioSchema>;

/** PATCH /usuarios/:id — cambios parciales (incluye activar/desactivar). */
export const ActualizarUsuarioSchema = DatosPersonalesSchema.partial()
  .extend({
    activo: z.boolean().optional(),
    rolId: z.string().uuid('Rol inválido').nullable().optional(),
    alcance: z.enum(['TODAS', 'ESPECIFICAS']).optional(),
    sedesIds: z.array(z.string().uuid('Sede inválida')).max(50).optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Envía al menos un campo para actualizar',
    path: [],
  });
export type ActualizarUsuarioRequest = z.input<typeof ActualizarUsuarioSchema>;

/** PUT /usuarios/:id/permisos — reemplaza el conjunto completo. */
export const EstablecerPermisosSchema = z.object({
  permisos: z.array(PermisoCodigoSchema).max(100),
});
export type EstablecerPermisosRequest = z.input<typeof EstablecerPermisosSchema>;

/** Query de GET /usuarios. */
export const ListarUsuariosQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  estado: z.enum(['todos', 'activo', 'inactivo']).default('todos'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListarUsuariosQuery = z.input<typeof ListarUsuariosQuerySchema>;

/** Usuario tal como lo lista/entrega la API (sin hash ni PII sensible extra). */
export interface UsuarioListado {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  esAdmin: boolean;
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: string | null;
  /** Códigos `modulo.accion` asignados (vacío para admin). */
  permisos: string[];
  /** Rol único de la persona (módulo Personas); null si aún no tiene. */
  rolId?: string | null;
  rolNombre?: string | null;
  /** Alcance sobre sedes y sedes efectivas (vacío si es TODAS). */
  alcance?: 'TODAS' | 'ESPECIFICAS';
  sedes?: { id: string; nombre: string }[];
}

/** POST /usuarios → incluye la contraseña temporal UNA sola vez. */
export interface UsuarioCreado {
  usuario: UsuarioListado;
  /** Se muestra una vez al admin y NO se guarda en claro. */
  passwordTemporal: string;
}

/** POST /usuarios/:id/reset-password → nueva contraseña temporal. */
export interface PasswordRestablecida {
  passwordTemporal: string;
}

/** Item del catálogo de permisos (agrupado por módulo en la UI). */
export interface PermisoCatalogoItem {
  codigo: string;
  nombre: string;
  modulo: string;
}

/** Envelope con paginación de GET /usuarios. */
export interface ListaUsuarios {
  items: UsuarioListado[];
  total: number;
  page: number;
  limit: number;
}