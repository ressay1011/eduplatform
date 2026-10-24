/**
 * Vitest del paquete types — solo cobertura: la configuración por defecto de
 * vitest basta para encontrar los specs.
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
      exclude: ['**/*.spec.ts', 'src/index.ts'],
    },
  },
});
