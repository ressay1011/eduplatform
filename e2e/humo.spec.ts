import { expect, test, type Page } from '@playwright/test';

/**
 * Humo E2E contra API + web reales.
 *
 * Los datos son los del colegio demo (`packages/database/scripts/seed-demo.mjs`):
 * el login resuelve el colegio por el dominio del correo y entra al dashboard.
 */
const EMAIL = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@juanaarias.edu.co';
const PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'Demo2026!';
const COLEGIO = 'I.E.T.D. Juana Arias de Benavides';

async function entrar(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(EMAIL);
  await page.getByRole('button', { name: /continuar/i }).click();
  await expect(page.getByText(/Estás entrando como/)).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('humo', () => {
  test('el login real lleva al dashboard del colegio', async ({ page }) => {
    await entrar(page);
    await expect(page.getByText(COLEGIO).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Buenos días|Buenas tardes|Buenas noches/,
    );
  });

  test('Personas → Empleados lista al admin con su rol', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Personas' }).click();
    await expect(page).toHaveURL(/\/dashboard\/personas/);

    await page.goto('/dashboard/personas/empleados');
    await expect(page.getByRole('heading', { name: 'Empleados' })).toBeVisible();

    const primeraFila = page.locator('table.per-tabla tbody tr').first();
    await expect(primeraFila).toContainText(EMAIL);
    await expect(primeraFila).toContainText('ADMIN');
    await expect(page.getByRole('columnheader', { name: 'Usuario' })).toBeVisible();
  });

  test('una contraseña errada no entra y muestra el error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(EMAIL);
    await page.getByRole('button', { name: /continuar/i }).click();
    await page.getByLabel('Contraseña', { exact: true }).fill('ClaveIncorrecta123!');
    await page.getByRole('button', { name: /ingresar/i }).click();

    await expect(page.getByText(/incorrectos/i)).toBeVisible();
    await expect(page).not.toHaveURL(/\/dashboard/);
  });
});
