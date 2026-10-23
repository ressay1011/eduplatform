/**
 * seed-demo.mjs — datos mínimos para poder entrar al entorno desplegado.
 *
 * Crea (idempotente) el colegio demo, una sede y el admin del colegio.
 * Se conecta con el rol MIGRATOR (dueño) a propósito: es un seed, no pasa por
 * la API ni por RLS.
 *
 * El hash se calcula fuera (bcrypt vive en apps/api), para no duplicar la
 * dependencia aquí:
 *   HASH=$(cd apps/api && node -e "require('bcrypt').hash(process.argv[1],12).then(console.log)" 'Clave')
 *   DEMO_HASH="$HASH" DATABASE_URL='postgresql://app_migrator:...' node packages/database/scripts/seed-demo.mjs
 */
import postgres from 'postgres';

const URL = process.env.DATABASE_URL;
const HASH = process.env.DEMO_HASH;
if (!URL || !HASH) {
  console.error('Faltan DATABASE_URL y/o DEMO_HASH.');
  process.exit(1);
}

const SUBDOMINIO = process.env.DEMO_SUBDOMINIO ?? 'demo-dist-1';
const DOMINIO_EMAIL = process.env.DEMO_DOMINIO ?? 'juanaarias.edu.co';
const EMAIL_ADMIN = process.env.DEMO_ADMIN ?? `admin@${DOMINIO_EMAIL}`;
const NOMBRE_COLEGIO = process.env.DEMO_COLEGIO ?? 'I.E.T.D. Juana Arias de Benavides';

const sql = postgres(URL, { max: 1 });

try {
  const existente = await sql`SELECT id FROM colegios WHERE subdominio = ${SUBDOMINIO} LIMIT 1`;
  let colegioId = existente[0]?.id;
  if (colegioId === undefined) {
    const [creado] = await sql`
      INSERT INTO colegios (nombre, codigo_dane, subdominio, dominio_email, municipio, departamento, email, calendario, estado, primary_color)
      VALUES (${NOMBRE_COLEGIO}, '105001000123', ${SUBDOMINIO}, ${DOMINIO_EMAIL}, 'Plato', 'Magdalena',
              ${`rectoria@${DOMINIO_EMAIL}`}, 'A', 'ACTIVO', '#0b57d0')
      RETURNING id
    `;
    colegioId = creado?.id;
    console.log(`# colegio creado: ${SUBDOMINIO} (${colegioId})`);
  } else {
    console.log(`# colegio existente: ${SUBDOMINIO} (${colegioId})`);
  }

  const sede = await sql`
    SELECT id FROM sedes WHERE colegio_id = ${colegioId} AND nombre = 'Sede Principal' LIMIT 1
  `;
  if (sede.length === 0) {
    await sql`INSERT INTO sedes (colegio_id, nombre) VALUES (${colegioId}, 'Sede Principal')`;
    console.log('# sede creada: Sede Principal');
  }

  const [admin] = await sql`
    INSERT INTO usuarios (colegio_id, email, password_hash, nombres, apellidos, tipo_documento,
                          numero_documento, es_admin, activo, debe_cambiar_password)
    VALUES (${colegioId}, ${EMAIL_ADMIN}, ${HASH}, 'Yasser Daniel', 'Ariza Barrios', 'CC',
            '1000000001', true, true, false)
    ON CONFLICT (colegio_id, email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          es_admin = true,
          activo = true,
          debe_cambiar_password = false,
          intentos_fallidos = 0,
          bloqueado_hasta = NULL
    RETURNING id
  `;
  console.log(`# admin listo: ${EMAIL_ADMIN} (${admin?.id})`);

  const [{ total }] = await sql`SELECT count(*)::int AS total FROM permisos`;
  console.log(`# permisos en catálogo: ${total}`);
} finally {
  await sql.end({ timeout: 5 });
}