/**
 * Bootstrap de la API EduPlatform (NestJS).
 * El prefijo global `/api`, CORS, helmet y pipes se configuran en
 * `configureApp` — compartido con los tests e2e para validar la
 * configuración REAL, no una copia.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // Cierra el pool y los recursos al recibir SIGTERM/SIGINT (R3 del informe).
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');

  Logger.log(`API escuchando en http://localhost:${env.PORT} (prefijo /api)`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error('Fallo al arrancar la API:', err);
  process.exit(1);
});
