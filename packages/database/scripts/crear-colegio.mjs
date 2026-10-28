/**
 * crear-colegio.mjs — alta manual de un colegio desde la línea de comandos.
 *
 * Uso:
 *   pnpm db:colegio <subdominio> [--nombre "I.E.T.D. Juana Arias"]
 *
 * Crea el colegio con lo mínimo (solo `subdominio`; el resto por defaults) y su
 * admin `admin@<subdominio>` con una contraseña temporal aleatoria que se
 * imprime UNA vez y obliga a cambiarla al entrar. Siembra los roles base.
 *
 * No crea sedes: el wizard de onboarding empieza en el paso 1.
 * Idempotente en el sentido contrario: si el subdominio ya existe, falla sin
 * tocar nada (para no pisar un colegio en producción).
 */
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const require = createRequire(
  'C:/Users/Usuario/Documents/Personal/EduPlatform/apps/api/package.json',
);
const bcrypt = require('bcrypt');

const here = dirname(fileURLToPath(import.meta.url));
const SUBDOMINIO_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Contraseña temporal: 12 caracteres con mayúscula, minúscula, dígito y símbolo. */
function passwordTemporal() {
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const minus = 'abcdefghijkmnopqrstuvwxyz';
  const digitos = '23456789';
  const simbolos = '!@#$%&*';
  const todos = mayus + minus + digitos + simbolos;
  const uno = (juego) => juego[randomInt(juego.length)];
  const base = [uno(mayus), uno(minus), uno(digitos), uno(simbolos)];
  while (base.length < 12) base.push(uno(todos));
  // Mezcla Fisher–Yates con el RNG criptográfico (nada de Math.random).
  for (let i = base.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
}

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const subdominio = (process.argv[2] ?? '').trim().toLowerCase();
if (!SUBDOMINIO_RE.test(subdominio)) {
  console.error(
    'Uso: pnpm db:colegio <subdominio> [--nombre "..."]\n' +
      'El subdominio debe ser 3–32 caracteres: minúsculas, números y guiones.',
  );
  process.exit(1);
}

const url =
  process.env['MIGRATOR_URL'] ??
  process.env['DATABASE_URL'] ??
  readFileSync(join(homedir(), '.eduplatform', 'neon-creds.json'), 'utf8').match(
    /postgres(?:ql)?:\/\/app_migrator[^"]+/,
  )?.[0];
if (url === undefined) {
  console.error('Falta MIGRATOR_URL (o DATABASE_URL) para crear el colegio.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const usuario = argumento('usuario') ?? `admin@${subdominio}`;
const nombre = argumento('nombre') ?? '';
const password = passwordTemporal();

try {
  const resultado = await sql.begin(async (tx) => {
    const [colegio] = await tx`
      INSERT INTO colegios (subdominio, nombre)
      VALUES (${subdominio}, ${nombre})
      ON CONFLICT (subdominio) DO NOTHING
      RETURNING id
    `;
    if (colegio === undefined) {
      throw new Error(`Ya existe un colegio con el subdominio «${subdominio}».`);
    }

    const hash = await bcrypt.hash(password, 12);
    await tx`
      INSERT INTO usuarios (colegio_id, usuario, password_hash, es_admin,
                            debe_cambiar_password, activo)
      VALUES (${colegio.id}, ${usuario}, ${hash}, true, true, true)
    `;

    // Roles base del colegio (0003 es idempotente y cubre todos los colegios).
    const rolesSql = readFileSync(join(here, '..', 'sql', '0003_roles_seed.sql'), 'utf8');
    await tx.unsafe(rolesSql);

    const [{ count }] = await tx`
      SELECT count(*)::int AS count FROM roles WHERE colegio_id = ${colegio.id}
    `;
    return { colegioId: colegio.id, roles: count };
  });

  console.log('\n✔ Colegio creado');
  console.log(`  id          ${resultado.colegioId}`);
  console.log(`  subdominio  ${subdominio}`);
  console.log(`  roles base  ${resultado.roles}`);
  console.log(`  usuario     ${usuario}`);
  console.log(`  contraseña  ${password}`);
  console.log('\nGuárdala ahora: no se vuelve a mostrar. Al entrar pedirá cambiarla.');
  console.log('El wizard de onboarding empieza en el paso 1 (no hay sede todavía).\n');
} finally {
  await sql.end({ timeout: 5 });
}
