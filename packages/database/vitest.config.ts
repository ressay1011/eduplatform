/**
 * Vitest del paquete database. Los tests que tocan Postgres leen DATABASE_URL
 * (runtime `app_user`); la cobertura se publica para Sonar.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/__tests__/**'],
    },
  },
});
