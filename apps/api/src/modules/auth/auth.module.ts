/**
 * AuthModule — auth propia (sesiones opacas + cookie httpOnly) y
 * autorización por permisos granulares (ADR-003).
 * Guards GLOBALES en orden de ejecución: Throttler → Auth → Tenant → Permissions.
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { env } from '../../config/env';
import { AuthContextService } from './auth-context.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { ContextoCacheService } from './contexto-cache.service';
import { AuthGuard } from './guards/auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { TenantGuard } from './guards/tenant.guard';
import { PasswordService } from './password.service';
import { SessionTokenService } from './session-token.service';

@Module({
  imports: [
    // Rate limiting global por IP (ventana de 60s); login usa @Throttle estricto.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: env.THROTTLE_LIMIT }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthContextService,
    AuthRepository,
    ContextoCacheService,
    LoginAttemptsService,
    PasswordService,
    SessionTokenService,
    // Guards globales — el orden de registro es el orden de ejecución.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}