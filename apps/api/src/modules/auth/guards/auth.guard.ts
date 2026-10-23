/**
 * AuthGuard (GLOBAL) — valida la cookie de sesión y puebla `req.auth`.
 * Los endpoints con @Public() no exigen sesión (si traen una cookie válida,
 * se adjunta el contexto igual).
 */
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCodes } from '@eduplatform/types';
import { apiError } from '../../../shared/api-error';
import { AuthContextService } from '../auth-context.service';
import { SESION_COOKIE } from '../auth.constants';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authContext: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = leerCookie(req, SESION_COOKIE);
    if (token === undefined) {
      if (esPublico) return true;
      throw apiError(ErrorCodes.UNAUTHORIZED, 401, 'Sesión requerida');
    }

    const auth = await this.authContext.resolver(token);
    if (auth === null) {
      if (esPublico) return true;
      throw apiError(ErrorCodes.UNAUTHORIZED, 401, 'Sesión inválida o expirada');
    }

    req.auth = auth;
    return true;
  }
}

/**
 * Lee una cookie string del request. Se usa Reflect.get porque
 * @types/cookie-parser tipa `req.cookies` como `any` — aquí se estrecha a
 * `unknown` sin assertions.
 */
function leerCookie(req: Request, nombre: string): string | undefined {
  const cookies: unknown = Reflect.get(req, 'cookies');
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const valor: unknown = Reflect.get(cookies, nombre);
  return typeof valor === 'string' ? valor : undefined;
}