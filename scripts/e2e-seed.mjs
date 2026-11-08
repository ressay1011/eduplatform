#!/usr/bin/env node
/**
 * Siembra el colegio demo que usa el humo E2E (`e2e/humo.spec.ts`).
 *
 * En CI lo hace el propio workflow (calcula el hash y llama a `db:seed`); esto
 * es lo mismo para la máquina local, donde el colegio `demo-dist-1` no existe.
 * La clave es la misma que espera el spec por defecto: `Demo2026!`.
 *
 * Uso: pnpm e2e:seed   (necesita Postgres arriba y el .env del paquete)
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const bcrypt = require('bcrypt');

const clave = process.env.E2E_ADMIN_PASSWORD ?? 'Demo2026!';
const hash = await bcrypt.hash(clave, 4); // coste 4: es una base de pruebas

// Nunca imprimir la clave: CodeQL marca el registro de secretos en claro.
console.log('# sembrando colegio demo (clave: la de E2E_ADMIN_PASSWORD)');
const r = spawnSync('pnpm', ['--filter', '@eduplatform/database', 'run', 'db:seed'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DEMO_HASH: hash },
});
process.exit(r.status ?? 1);
