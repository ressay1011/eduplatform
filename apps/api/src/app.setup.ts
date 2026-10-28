/**
 * Configuración común de la app (la usan main.ts Y los tests e2e):
 * prefijo global /api, helmet y CORS con credenciales.
 * La validación de entrada se hace con Zod en cada controller
 * (decisión del proyecto) — sin class-validator/ValidationPipe.
 */
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env';
import { ApiExceptionFilter } from './shared/api-exception.filter';

export function configureApp(app: INestApplication): void {
  // Todas las rutas de la API viven bajo /api
  app.setGlobalPrefix('api');

  // Headers de seguridad. Se deja la CSP por defecto: esta API solo responde
  // JSON bajo /api, así que la política no limita al frontend (que es otro
  // origen) y sí protege si alguna respuesta se abre como documento.
  app.use(helmet());

  // Cookies httpOnly con la sesión (auth propia) — req.cookies en los guards
  app.use(cookieParser());

  // Render (y otros PaaS) está detrás de un proxy: sin esto req.ip sería la IP
  // del proxy y el rate limiting castigaría a TODOS los usuarios por igual.
  interface ExpressApp {
    set(clave: string, valor: unknown): void;
  }
  const expressApp: ExpressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // CORS con credenciales — necesario para las cookies del auth en el navegador
  app.enableCors({ origin: env.CORS_ORIGINS.split(','), credentials: true });

  // Toda respuesta autenticada es dato personal: que no la guarde ningún
  // proxy/CDN ni el caché del navegador (Ley 1581; S6 del informe).
  app.use(
    (
      _req: unknown,
      res: { setHeader(nombre: string, valor: string): void },
      siguiente: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      siguiente();
    },
  );

  // Toda respuesta de error sigue el contrato {success:false, error:{code,...}}
  app.useGlobalFilters(new ApiExceptionFilter());
}
