/**
 * @AllowPendingPassword() — deja pasar la petición aunque el usuario tenga la
 * contraseña inicial sin cambiar (`debeCambiarPassword = true`).
 *
 * Solo lo llevan las rutas con las que el usuario puede salir del paso:
 * consultar su sesión (`me`), cerrarla (`logout`) y cambiarla
 * (`cambiar-password`). El resto queda en 403 PASSWORD_CHANGE_REQUIRED.
 */
import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';

export const AllowPendingPassword = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
