/**
 * Playwright — humo E2E de EduPlatform.
 *
 * Cubre lo que no ven los tests de unidad: que la web hable con la API real
 * (CSP, cookie httpOnly, CORS) y que el login lleve a un dashboard con datos.
 *
 * Local:
 *   docker compose start  (Postgres healthy)
 *   pnpm build            (api + web; la web congela NEXT_PUBLIC_API_URL)
 *   pnpm e2e
 *
 * Playwright levanta API (4000) y web (3000) si no están ya arriba
 * (`reuseExistingServer`). En CI el job `verificar` prepara Postgres, la
 * siembra y el build antes de correr el humo.
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
  retries: process.env['CI'] === 'true' ? 1 : 0,
  reporter:
    process.env['CI'] === 'true'
      ? [['list'], ['html', { open: 'never' }]]
      : [['list']],
  use: {
    baseURL: WEB,
    locale: 'es-CO',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
