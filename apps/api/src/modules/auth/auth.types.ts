/**
 * Tipos del contexto de autenticación de la request.
 * Lo puebla AuthGuard y lo consumen TenantGuard, PermissionsGuard y los
 * controllers (vía `@CurrentAuth()`).
 */
import type { Request } from 'express';
import type { ContextoColegioPublico } from '@eduplatform/types';

/**
 * Contexto público + subdominio del colegio.
 * Lo devuelve el login unificado (resolución por dominio del correo) para que
 * la web pueda mostrar la sede y, si quiere, enlazar a la URL del colegio.
 */
export interface ContextoPublicoConSede extends ContextoColegioPublico {
  readonly subdominio: string;
}

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
  readonly subdominio: string;
  readonly primaryColor: string | null;
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
