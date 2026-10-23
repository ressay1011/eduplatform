/**
 * Vitest para la API — usa SWC (unplugin-swc) porque compila los decoradores
 * de NestJS CON `emitDecoratorMetadata` (esbuild no lo soporta, y la
 * inyección de dependencias de Nest lo necesita).
 */
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
