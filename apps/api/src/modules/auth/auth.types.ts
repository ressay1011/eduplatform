/**
 * Tipos del contexto de autenticación de la request.
 * Lo puebla AuthGuard y lo consumen TenantGuard, PermissionsGuard y los
 * controllers (vía `@CurrentAuth()`).
 */
import type { Request } from 'express';
import type { ContextoColegioPublico, PaletaColegio } from '@eduplatform/types';

/**
 * Contexto público que se guarda en el caché del login. El colegio se identifica
 * por su código (`ContextoColegioPublico.codigo`).
 */
export type ContextoPublicoConSede = ContextoColegioPublico;

/** Datos del usuario de colegio disponibles con la sesión (sin passwordHash). */
export interface UsuarioColegioAuth {
  readonly id: string;
  readonly colegioId: string;
  readonly usuario: string;
  readonly nombres: string;
  readonly apellidos: string;
  readonly esAdmin: boolean;
  readonly debeCambiarPassword: boolean;
  readonly activo: boolean;
}

/** Datos del colegio de la sesión. */
export interface ColegioAuth {
  readonly id: string;
  readonly nombre: string;
  readonly codigoDane: string | null;
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
  readonly tertiaryColor: string | null;
  readonly palette: PaletaColegio | null;
}

/** Sesión de un usuario de colegio (tenant-scoped). */
export interface ColegioAuthContext {
  readonly tipo: 'colegio';
  readonly sesionId: string;
  readonly expiraEn: Date;
  readonly usuario: UsuarioColegioAuth;
  readonly colegio: ColegioAuth;
  /** Códigos `modulo.accion` asignados (vacío si esAdmin — ver flag). */
  readonly permisos: readonly string[];
  readonly esAdmin: boolean;
}

/** Sesión de un usuario del nivel plataforma (equipo SaaS). */
export interface PlataformaAuthContext {
  readonly tipo: 'plataforma';
  readonly sesionId: string;
  readonly expiraEn: Date;
  readonly plataformaUsuario: {
    readonly id: string;
    readonly email: string;
    readonly nombreCompleto: string;
    readonly rol: string;
  };
}

export type AuthContext = ColegioAuthContext | PlataformaAuthContext;

/** Request con el contexto de auth adjunto y cookies parseadas. */
export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

/** Metadatos de la request para auditoría y sesiones. */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}
