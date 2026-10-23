/**
 * apply-rls.mjs — aplica la RLS y el seed de permisos a la base local.
 *
 * Uso: `pnpm db:rls` (desde packages/database) después de `pnpm db:push`.
 * Se conecta como app_migrator (dueño del esquema) leyendo DATABASE_URL
 * del entorno. Ambos SQL son idempotentes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const url =
  process.env.DATABASE_URL ??
  'postgresql://app_migrator:app_migrator_dev@localhost:5432/eduplatform';

const sql = postgres(url, { max: 1 });

const ARCHIVOS = ['0001_rls_policies.sql', '0002_seed_permisos.sql', '0003_roles_seed.sql'];

try {
  for (const archivo of ARCHIVOS) {
    const contenido = readFileSync(join(here, '..', 'sql', archivo), 'utf8');
    await sql.unsafe(contenido);
    console.log(`✔ aplicado: sql/${archivo}`);
  }
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM permisos`;
  console.log(`✔ permisos en el catálogo: ${count}`);
  console.log('RLS + seed aplicados correctamente.');
} catch (err) {
  console.error('✘ Error aplicando RLS/seed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}