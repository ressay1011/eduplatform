/**
 * Exige uno o más permisos (`modulo.accion`) en un endpoint (ADR-003).
 * Pasan siempre: `es_admin = true` y los usuarios de plataforma.
 */
import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export const RequirePermission = (
  ...permisos: string[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRE_PERMISSION_KEY, permisos);