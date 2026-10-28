/**
 * Corre un archivo SQL de `packages/database/sql` contra la rama de Neon `dev`
 * (como app_migrator) y muestra el estado de colegios/usuarios.
 *
 * Uso: DEV_SQL=0006_usuarios_y_defaults.sql node scripts/tmp-dev-sql.mjs
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';

const archivo = process.env['DEV_SQL'];
if (archivo === undefined) throw new Error('Falta DEV_SQL');

const home = homedir();
const url = readFileSync(join(home, '.eduplatform', 'neon-branch-dev.url'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('postgres'));

const sql = postgres(url, { max: 1 });
try {
  if (archivo !== '-') {
    const ddl = readFileSync(
      join('C:/Users/Usuario/Documents/Personal/EduPlatform/packages/database/sql', archivo),
      'utf8',
    );
    await sql.unsafe(ddl);
    console.log(`✔ aplicado ${archivo}`);
  }

  const columnas = await sql`SELECT column_name FROM information_schema.columns
                              WHERE table_name = 'colegios' AND column_name IN ('dominio_email','subdominio')`;
  console.log('columnas colegios:', columnas.map((c) => c.column_name));

  const colegios = await sql`SELECT id, subdominio, nombre, onboarding_paso FROM colegios ORDER BY subdominio`;
  console.log('colegios:', colegios);

  const usuarios = await sql`SELECT usuario, es_admin, debe_cambiar_password FROM usuarios ORDER BY usuario`;
  console.log('usuarios:', usuarios);

  const restricciones = await sql`SELECT conname FROM pg_constraint
                                   WHERE conname IN ('colegios_subdominio_no_vacio','usuarios_usuario_no_vacio','usuarios_password_no_vacio')
                                   ORDER BY conname`;
  console.log('checks:', restricciones.map((r) => r.conname));
} finally {
  await sql.end({ timeout: 5 });
}
