/**
 * apply-rls.mjs — aplica RLS, el seed de permisos y las migraciones SQL.
 *
 * Uso: `pnpm db:rls` (desde packages/database) después de `pnpm db:push`.
 * Se conecta como app_migrator (dueño del esquema) leyendo DATABASE_URL
 * del entorno. Todos los SQL son idempotentes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (url === undefined || url === '') {
  // Sin credenciales en el código: la cadena llega por entorno (.env o CI).
  console.error('Falta DATABASE_URL (rol app_migrator) para aplicar RLS.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const ARCHIVOS = [
  '0001_rls_policies.sql',
  '0002_seed_permisos.sql',
  '0003_roles_seed.sql',
  // 0008 es aditiva: rellena `colegios.codigo` desde el subdominio y crea los
  // índices sin caja. Se reaplica en cada `db:rls` sin efecto si ya está.
  '0008_codigo_colegio.sql',
  // 0009 recrea la vista pública con el código; 0010 completa el sufijo en los
  // usuarios que quedaron sin él. Las dos son idempotentes.
  '0009_colegio_publico_codigo.sql',
  '0010_usuarios_con_codigo.sql',
  // 0011 es DESTRUCTIVA: borra `colegios.subdominio`. Va la última y solo con el
  // código ya desplegado (etapas A–C); normaliza antes los identificadores.
  '0011_sin_subdominio.sql',
];

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
