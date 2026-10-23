/**
 * neon-bootstrap.mjs — prepara un proyecto de Neon para EduPlatform.
 *
 * Crea (idempotente) los dos roles del ADR-002 y la base de datos:
 *   - app_migrator: dueño del esquema; lo usa drizzle-kit y el SQL de RLS.
 *   - app_user:     runtime de la API, SUJETO a RLS (sin BYPASSRLS).
 *
 * Uso:
 *   NEON_OWNER_URL='postgresql://...' node scripts/neon-bootstrap.mjs > creds.json
 *
 * Requiere la URL del rol dueño que da Neon (neondb_owner). Imprime por stdout
 * un JSON con las dos URLs resultantes: redirigirlo a un archivo, NO a la
 * consola, porque contienen contraseñas.
 */
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const OWNER_URL = process.env.NEON_OWNER_URL;
const DB = process.env.NEON_DB ?? 'eduplatform';
if (!OWNER_URL) {
  console.error('Falta NEON_OWNER_URL (cadena de conexión del rol dueño de Neon).');
  process.exit(1);
}

/** Contraseña aleatoria URL-safe (sin caracteres que rompan la URL). */
const password = () => randomBytes(24).toString('base64url');

const migratorPassword = password();
const appPassword = password();

/** Cambia el usuario de una URL de conexión y su contraseña. */
function conUsuario(url, usuario, clave, base = null) {
  const parsed = new URL(url);
  parsed.username = usuario;
  parsed.password = clave;
  if (base !== null) parsed.pathname = `/${base}`;
  return parsed.toString();
}

const sql = postgres(OWNER_URL, { max: 1 });

try {
  let filas = await sql`SELECT current_user AS usuario`;
  console.log(`# conectado como ${filas[0]?.usuario ?? '?'}`);

  // Roles del ADR-002. Si ya existen, se rota la contraseña (idempotente).
  for (const [rol, clave] of [
    ['app_migrator', migratorPassword],
    ['app_user', appPassword],
  ]) {
    const existe = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${rol}`;
    if (existe.length === 0) {
      await sql.unsafe(`CREATE ROLE ${rol} LOGIN PASSWORD '${clave}'`);
      console.log(`# rol creado: ${rol}`);
    } else {
      await sql.unsafe(`ALTER ROLE ${rol} LOGIN PASSWORD '${clave}'`);
      console.log(`# rol existente, contraseña rotada: ${rol}`);
    }
  }

  // La base se crea con app_migrator como dueño. Para eso el rol actual debe
  // poder "ser" app_migrator (Neon permite crear roles, así que también
  // concedérselo a sí mismo).
  await sql.unsafe('GRANT app_migrator TO CURRENT_USER');

  const baseExiste = await sql`SELECT 1 FROM pg_database WHERE datname = ${DB}`;
  if (baseExiste.length === 0) {
    await sql.unsafe(`CREATE DATABASE ${DB} OWNER app_migrator`);
    console.log(`# base creada: ${DB} (dueño app_migrator)`);
  } else {
    console.log(`# base existente: ${DB}`);
  }

  await sql.unsafe(`GRANT CONNECT ON DATABASE ${DB} TO app_user`);
  console.log('# GRANT CONNECT a app_user');
} finally {
  await sql.end({ timeout: 5 });
}

// Conectado a la base nueva como app_migrator: privilegios por defecto para que
// TODA tabla que cree el migrator (incluidas las de drizzle-kit) sea usable por
// el runtime. Sin esto la API recibiría "permission denied" en la primera query.
const migratorUrl = conUsuario(OWNER_URL, 'app_migrator', migratorPassword, DB);
const sqlBase = postgres(migratorUrl, { max: 1 });
try {
  await sqlBase.unsafe('GRANT USAGE ON SCHEMA public TO app_user');
  await sqlBase.unsafe(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user',
  );
  await sqlBase.unsafe(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user',
  );
  const [quien] = await sqlBase`SELECT current_user AS usuario, current_database() AS base`;
  console.log(`# listo: ${quien?.usuario}@${quien?.base}`);
} finally {
  await sqlBase.end({ timeout: 5 });
}

console.log(
  JSON.stringify(
    {
      host: new URL(OWNER_URL).host,
      database: DB,
      migratorUrl,
      appUrl: conUsuario(OWNER_URL, 'app_user', appPassword, DB),
    },
    null,
    2,
  ),
);