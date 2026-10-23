/**
 * Conversiones fila/contexto → contrato de API del módulo auth.
 * (AGENTS.md §2.1: conversiones van a un mapper, no al service.)
 */
import type { ColegioSesion, LoginResponse, MeResponse, UsuarioSesion } from '@eduplatform/types';
import { RolPlataforma } from '@eduplatform/types';
import type { AuthContext } from './auth.types';
import type { ColegioAuthRow, UsuarioAuthRow } from './auth.repository';

/** Subconjunto estructural compartido entre filas de BD y contexto de sesión. */
export interface UsuarioSesionFuente {
  readonly id: string;
  readonly email: string;
  readonly nombres: string;
  readonly apellidos: string;
  readonly esAdmin: boolean;
  readonly debeCambiarPassword: boolean;
}

/** Subconjunto estructural del colegio para la sesión. */
export interface ColegioSesionFuente {
  readonly id: string;
  readonly nombre: string;
  readonly codigoDane: string;
  readonly primaryColor: string | null;
}

export function toUsuarioSesion(usuario: UsuarioSesionFuente): UsuarioSesion {
  return {
    id: usuario.id,
    email: usuario.email,
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    esAdmin: usuario.esAdmin,
    debeCambiarPassword: usuario.debeCambiarPassword,
  };
}

export function toColegioSesion(colegio: ColegioSesionFuente): ColegioSesion {
  return {
    id: colegio.id,
    nombre: colegio.nombre,
    codigoDane: colegio.codigoDane,
    primaryColor: colegio.primaryColor,
  };
}

export function toLoginResponse(
  usuario: UsuarioAuthRow,
  colegio: ColegioAuthRow,
): LoginResponse {
  return {
    usuario: toUsuarioSesion(usuario),
    colegio: toColegioSesion(colegio),
  };
}

/** Normaliza el rol crudo de BD al enum del contrato (default conservador). */
export function normalizarRolPlataforma(rol: string): RolPlataforma {
  return rol === RolPlataforma.SUPER_ADMIN ? RolPlataforma.SUPER_ADMIN : RolPlataforma.SOPORTE;
}

export function toMeResponse(auth: AuthContext): MeResponse {
  if (auth.tipo === 'plataforma') {
    return {
      tipo: 'plataforma',
      plataformaUsuario: {
        id: auth.plataformaUsuario.id,
        email: auth.plataformaUsuario.email,
        nombreCompleto: auth.plataformaUsuario.nombreCompleto,
        rol: normalizarRolPlataforma(auth.plataformaUsuario.rol),
      },
    };
  }
  return {
    tipo: 'colegio',
    usuario: toUsuarioSesion(auth.usuario),
    colegio: toColegioSesion(auth.colegio),
    permisos: [...auth.permisos],
    esAdmin: auth.esAdmin,
  };
}