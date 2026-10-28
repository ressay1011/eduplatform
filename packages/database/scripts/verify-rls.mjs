/**
 * verify-rls.mjs — comprueba que la RLS está ACTIVA contra una base remota.
 *
 * Uso (con el rol de runtime, app_user):
 *   DATABASE_URL='postgresql://app_user:...' TENANT_ID='<uuid colegio>' node scripts/verify-rls.mjs
 *
 * Qué valida:
 *  1. El rol conectado NO es el dueño (si lo fuera, la RLS sería inerte — S8).
 *  2. `roles`, `usuarios`, `usuarios_sedes` tienen RLS habilitada.
 *  3. Sin `app.current_tenant`: 0 filas (fail-closed).
 *  4. Con el tenant correcto: se ven los datos.
 *  5. Con otro tenant: 0 filas (aislamiento).
 */
import postgres from 'postgres';

const URL = process.env.DATABASE_URL;
const TENANT = process.env.TENANT_ID;
if (!URL || !TENANT) {
  console.error('Faltan DATABASE_URL y/o TENANT_ID.');
  process.exit(1);
}

const TABLAS = ['roles', 'usuarios', 'usuarios_sedes', 'sedes', 'estudiantes'];
const sql = postgres(URL, { max: 1 });
let fallos = 0;

const revisar = (ok, mensaje) => {
  console.log(`${ok ? 'OK ' : 'XX '} ${mensaje}`);
  if (!ok) fallos += 1;
};

try {
  const [quien] = await sql`SELECT current_user AS usuario, current_database() AS base`;
  console.log(`# ${quien?.usuario}@${quien?.base}`);
  revisar(quien?.usuario === 'app_user', 'el runtime conecta como app_user');

  const rls = await sql`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ${sql(TABLAS)} AND relkind = 'r'
  `;
  for (const tabla of TABLAS) {
    const fila = rls.find((r) => r.relname === tabla);
    revisar(fila?.relrowsecurity === true, `RLS habilitada en ${tabla}`);
  }

  const [sinTenant] = await sql`SELECT count(*)::int AS n FROM roles`;
  revisar(sinTenant?.n === 0, `sin tenant, roles devuelve 0 (fue ${sinTenant?.n})`);

  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${TENANT}, true)`;
    const [conTenant] = await tx`SELECT count(*)::int AS n FROM roles`;
    revisar(
      (conTenant?.n ?? 0) >= 5,
      `con el tenant, roles devuelve ${conTenant?.n} (esperado ≥5)`,
    );

    const [ajeno] =
      await tx`SELECT count(*)::int AS n FROM usuarios WHERE colegio_id <> ${TENANT}::uuid`;
    revisar(ajeno?.n === 0, `no se ven usuarios de otro colegio (${ajeno?.n})`);
  });

  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', '00000000-0000-0000-0000-000000000001', true)`;
    const [otro] = await tx`SELECT count(*)::int AS n FROM usuarios`;
    revisar(otro?.n === 0, `con un tenant ajeno, usuarios devuelve 0 (${otro?.n})`);
  });

  const publico = await sql`SELECT subdominio FROM colegios_publico LIMIT 3`;
  revisar(
    publico.length > 0,
    `vista pública del login visible (${publico.map((c) => c.dominio_email).join(', ')})`,
  );
} finally {
  await sql.end({ timeout: 5 });
}

console.log(
  fallos === 0 ? '\nRLS verificada: sin fugas.' : `\n${fallos} comprobación(es) fallaron.`,
);
process.exit(fallos === 0 ? 0 : 1);
