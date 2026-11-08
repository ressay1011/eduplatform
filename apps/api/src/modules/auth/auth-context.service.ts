/**
 * AuthContextService — resuelve el contexto de sesión a partir del token
 * crudo de la cookie (o null si la sesión no es válida): valida expiración/
 * revocación, carga usuario + colegio + permisos y actualiza actividad
 * (con throttle). Lo usa el AuthGuard en cada request.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import { platformTenantContext } from '../../shared/platform-context';
import { ACTIVIDAD_THROTTLE_MS, SESION_INACTIVIDAD_MS } from './auth.constants';
import { AuthRepository, type SesionAuthRow } from './auth.repository';
import { SessionTokenService } from './session-token.service';
import type { AuthContext, ColegioAuthContext, PlataformaAuthContext } from './auth.types';

/** Estados del colegio que impiden usar sesiones activas. */
const COLEGIO_SUSPENDIDO = 'SUSPENDIDO';

@Injectable()
export class AuthContextService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly tokens: SessionTokenService,
  ) {}

  /** Resuelve la sesión del token; null si no es válida (expirada, revocada...). */
  async resolver(token: string): Promise<AuthContext | null> {
    const sesion = await this.repo.findSesionAuth(this.tokens.hash(token));
    if (sesion === null) return null;
    if (sesion.revocadaEn !== null) return null;
    if (sesion.expiraEn.getTime() <= Date.now()) return null;

    // Inactividad: se cierra la sesión y se revoca en BD, para que no quede
    // viva hasta su expiración absoluta (12 h o 30 días).
    if (Date.now() - sesion.ultimaActividadEn.getTime() > SESION_INACTIVIDAD_MS) {
      await this.revocarPorInactividad(sesion);
      return null;
    }

    if (sesion.usuarioId !== null && sesion.colegioId !== null) {
      return this.resolverColegio(sesion, sesion.usuarioId, sesion.colegioId);
    }
    if (sesion.plataformaUsuarioId !== null) {
      return this.resolverPlataforma(sesion, sesion.plataformaUsuarioId);
    }
    return null;
  }

  /**
   * Revoca una sesión vencida por inactividad. Si el UPDATE falla no se
   * propaga: la sesión ya se rechaza igual con el `return null`.
   */
  private async revocarPorInactividad(sesion: SesionAuthRow): Promise<void> {
    if (sesion.colegioId !== null) {
      await this.repo.revocarSesionColegio(
        { colegioId: sesion.colegioId, isPlatformAdmin: false },
        sesion.id,
      );
      return;
    }
    await this.repo.revocarSesionPlataforma(platformTenantContext(), sesion.id);
  }

  private async resolverColegio(
    sesion: SesionAuthRow,
    usuarioId: string,
    colegioId: string,
  ): Promise<ColegioAuthContext | null> {
    const ctx: TenantContext = { colegioId, isPlatformAdmin: false, userId: usuarioId };

    // Una sola consulta: usuario + colegio + permisos (una transacción).
    const {
      usuario,
      colegio,
      permisos: asignados,
    } = await this.repo.findContextoDeSesion(ctx, usuarioId);
    if (usuario === null || !usuario.activo) return null;
    if (colegio === null || colegio.estado === COLEGIO_SUSPENDIDO) return null;

    const permisos = usuario.esAdmin ? [] : asignados;

    // Actividad reciente (throttle: como máximo un UPDATE por ventana).
    if (Date.now() - sesion.ultimaActividadEn.getTime() > ACTIVIDAD_THROTTLE_MS) {
      await this.repo.touchSesion(ctx, sesion.id);
    }

    return {
      tipo: 'colegio',
      sesionId: sesion.id,
      expiraEn: sesion.expiraEn,
      usuario: {
        id: usuario.id,
        colegioId: usuario.colegioId,
        usuario: usuario.usuario,
        nombres: usuario.nombres ?? '',
        apellidos: usuario.apellidos ?? '',
        esAdmin: usuario.esAdmin,
        debeCambiarPassword: usuario.debeCambiarPassword,
        activo: usuario.activo,
      },
      colegio: {
        id: colegio.id,
        nombre: colegio.nombre,
        codigoDane: colegio.codigoDane,
        primaryColor: colegio.primaryColor,
        secondaryColor: colegio.secondaryColor,
        tertiaryColor: colegio.tertiaryColor,
        palette: colegio.palette,
      },
      permisos,
      esAdmin: usuario.esAdmin,
    };
  }

  private async resolverPlataforma(
    sesion: SesionAuthRow,
    plataformaUsuarioId: string,
  ): Promise<PlataformaAuthContext | null> {
    const usuario = await this.repo.findPlataformaUsuarioPorId(
      platformTenantContext(),
      plataformaUsuarioId,
    );
    if (usuario === null || !usuario.activo) return null;
    return {
      tipo: 'plataforma',
      sesionId: sesion.id,
      expiraEn: sesion.expiraEn,
      plataformaUsuario: {
        id: usuario.id,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
        rol: usuario.rol,
      },
    };
  }
}
