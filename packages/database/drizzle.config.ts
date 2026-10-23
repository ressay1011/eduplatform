/**
 * Configuración de drizzle-kit (generar migraciones, push, studio).
 *
 * DATABASE_URL se toma del entorno — drizzle-kit carga los archivos .env
 * del paquete automáticamente. Para desarrollo local con docker-compose:
 *   postgresql://app_migrator:...@localhost:5432/eduplatform
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Fallback solo para desarrollo local (ver docker-compose.yml en la raíz)
    url:
      process.env['DATABASE_URL'] ??
      'postgresql://app_migrator:app_migrator_dev@localhost:5432/eduplatform',
  },
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});