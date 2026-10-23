/**
 * PermissionsGuard (GLOBAL) — valida los permisos exigidos con
 * @RequirePermission (ADR-003). Pasan siempre: `es_admin = true` y los
 * usuarios de plataforma (nivel SaaS, cross-tenant). Cuando se deniega,
 * se audita PERMISSION_DENIED antes de responder 403.
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '@eduplatform/types';
import { apiError } from '../../../shared/api-error';
import { AuditService } from '../../../shared/audit.service';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requeridos =
      this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (requeridos.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = req.auth;
    if (auth === undefined) {
      throw apiError(ErrorCodes.UNAUTHORIZED, 401, 'Sesión requerida');
    }
    if (auth.tipo === 'plataforma') return true;
    if (auth.esAdmin) return true;

    const faltantes = requeridos.filter((permiso) => !auth.permisos.includes(permiso));
    if (faltantes.length === 0) return true;

    await this.audit.registrar({
      accion: 'PERMISSION_DENIED',
      entidad: 'auth',
      colegioId: auth.colegio.id,
      usuarioId: auth.usuario.id,
      metadata: { motivo: `Permisos faltantes: ${faltantes.join(', ')}` },
    });
    throw apiError(
      ErrorCodes.FORBIDDEN,
      403,
      'No tienes permisos para realizar esta acción',
      { requiere: requeridos },
    );
  }
}