/**
 * TenantGuard (GLOBAL) — si la request de un usuario de colegio trae el
 * header `X-Colegio-Subdominio`, debe coincidir con el subdominio de su
 * sesión (los usuarios de plataforma no están atados a un colegio).
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ErrorCodes } from '@eduplatform/types';
import { apiError } from '../../../shared/api-error';
import type { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = req.auth;
    if (auth === undefined || auth.tipo !== 'colegio') return true;

    const header = req.headers['x-colegio-subdominio'];
    const subdominio = Array.isArray(header) ? header[0] : header;
    if (
      subdominio !== undefined &&
      subdominio.length > 0 &&
      subdominio !== auth.colegio.subdominio
    ) {
      throw apiError(ErrorCodes.FORBIDDEN, 403, 'El subdominio no corresponde a la sesión activa');
    }
    return true;
  }
}
