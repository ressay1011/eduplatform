/**
 * Playwright — humo E2E de EduPlatform.
 *
 * Cubre lo que no ven los tests de unidad: que la web hable con la API real
 * (CSP, cookie httpOnly, CORS) y que el login lleve a un dashboard con datos.
 * Corre dos veces: escritorio (Chromium) y móvil (390×844 con flags de teléfono).
 *
 * Local, desde cero:
 *   docker compose up -d      Postgres healthy
 *   pnpm e2e:install          navegador de Playwright (~130 MB, una vez)
 *   pnpm e2e:seed             colegio demo `demo-dist-1` (clave Demo2026!)
 *   pnpm build                api + web; la web congela NEXT_PUBLIC_API_URL
 *   pnpm e2e
 *
 * Con el stack ya arriba, Playwright reutiliza API (4000) y web (3000), así que
 * ojo: reutiliza el BUILD que esté sirviendo, no el código sin compilar.
 * En CI el job `verificar` prepara Postgres, siembra y build antes del humo, y
 * ahí `reuseExistingServer` está apagado a propósito.
 */
import { defineConfig, devices } from '@playwright/test';

const API = process.env['E2E_API_URL'] ?? 'http://localhost:4000';
const WEB = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // Un `test.only` olvidado dejaría el CI en verde corriendo un solo test.
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] === 'true' ? 1 : 0,
  reporter: process.env['CI'] === 'true' ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB,
    locale: 'es-CO',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // Teléfono de 390 px, el ancho del diseño móvil. Chromium con los flags
      // de móvil (touch, escala, meta viewport): el humo corre en un motor que
      // ya está instalado, sin arrastrar WebKit al CI.
      name: 'movil',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @eduplatform/api run start',
      url: `${API}/api/health`,
      reuseExistingServer: process.env['CI'] !== 'true',
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @eduplatform/web run start',
      url: `${WEB}/login`,
      reuseExistingServer: process.env['CI'] !== 'true',
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
