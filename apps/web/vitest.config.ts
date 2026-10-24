/**
 * Vitest para el web — jsdom + React (plugin oficial).
 * Los mocks de `next/navigation` deben usar vi.hoisted (pitfall conocido:
 * factories con variables externas mueren por TDZ).
 */
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Alias `@/*` (mismo que tsconfig) — vitest NO lee tsconfig paths.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/*.spec.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.spec.{ts,tsx}', '**/__tests__/**'],
    },
  },
});
