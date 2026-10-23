/** Inyecta el AuthContext de la request (lo puebla el AuthGuard global). */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ErrorCodes } from '@eduplatform/types';
import { apiError } from '../../../shared/api-error';
import type { AuthContext, AuthenticatedRequest } from '../auth.types';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.auth === undefined) {
      throw apiError(ErrorCodes.UNAUTHORIZED, 401, 'Sesión requerida');
    }
    return req.auth;
  },
);