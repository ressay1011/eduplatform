/**
 * audit-seguridad.mjs — auditoría de roles, privilegios y RLS contra una base.
 *
 * Uso (con el rol de RUNTIME, para que el resultado hable del rol real):
 *   DATABASE_URL='postgresql://app_user:...' pnpm db:audit
 *
 * Qué comprueba (falla con código 1 si algo se sale del patrón):
 *  1. Roles: ni app_user ni app_migrator son superusuario, ni tienen BYPASSRLS,
 *     CREATEDB o CREATEROLE; app_user no pertenece a ningún rol privilegiado.
 *  2. RLS: toda tabla con `colegio_id` tiene RLS activa y al menos una política;
 *     ninguna política es `USING (true)` sin filtro.
 *  3. Propiedad: las tablas de `public` son de app_migrator (nunca de app_user).
 *  4. Privilegios: app_user puede leer y escribir lo que necesita, pero NO tiene
 *     CREATE en el esquema/base, ni TRUNCATE, ni DDL sobre las tablas.
 *  5. Default ACL: las tablas nuevas de app_migrator darán DML a app_user.
 *  6. Funciones SECURITY DEFINER en public: deben ser de app_migrator.
 *  7. Vistas pre-tenant (`colegios_publico`, `sesiones_auth`) existen y no
 *     exponen `password_hash`.
 */
import postgres from 'postgres';

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error('Falta DATABASE_URL (usa el rol de runtime, app_user).');
  process.exit(1);
}

const ROLES = ['app_user', 'app_migrator'];
const VISTAS = ['colegios_publico', 'sesiones_auth'];
const sql = postgres(URL, { max: 1 });

let fallos = 0;
let avisos = 0;

const ok = (condicion, mensaje) => {
  console.log(`${condicion ? 'OK ' : 'XX '} ${mensaje}`);
  if (!condicion) fallos += 1;
};
const aviso = (condicion, mensaje) => {
  if (!condicion) {
    console.log(`!!  ${mensaje}`);
    avisos += 1;
  }
};

const seccion = (titulo) => console.log(`\n— ${titulo} —`);

try {
  const [quien] = await sql`SELECT current_user AS usuario, current_database() AS base`;
  console.log(`# ${quien.usuario}@${quien.base}`);
  aviso(
    quien.usuario === 'app_user',
    `la auditoría no corre como app_user (${quien.usuario}): los privilegios se evalúan por nombre, pero el contexto no es el de runtime`,
  );

  // ── 1. Roles ───────────────────────────────────────────────────────────────
  seccion('Roles');
  for (const rol of ROLES) {
    const [fila] = await sql`
      SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
      FROM pg_roles WHERE rolname = ${rol}`;
    if (!fila) {
      ok(false, `el rol ${rol} existe`);
      continue;
    }
    ok(fila.rolsuper !== true, `${rol} no es superusuario`);
    ok(fila.rolbypassrls !== true, `${rol} no tiene BYPASSRLS`);
    ok(fila.rolcreatedb !== true, `${rol} no puede crear bases`);
    ok(fila.rolcreaterole !== true, `${rol} no puede crear roles`);
  }

  const membresias = await sql`
    SELECT m.roleid::regrole::text AS privilegiado, m.member::regrole::text AS miembro
    FROM pg_auth_members m
    WHERE m.member::regrole::text IN ${sql(ROLES)}
      AND m.roleid::regrole::text NOT IN ('app_user', 'app_migrator')`;
  ok(
    membresias.length === 0,
    `app_user/app_migrator no heredan roles ajenos (encontrados: ${membresias.map((m) => `${m.miembro}→${m.privilegiado}`).join(', ') || 'ninguno'})`,
  );

  // ── 2. RLS ─────────────────────────────────────────────────────────────────
  seccion('RLS por tabla');
  const conColegio = await sql`
    SELECT c.relname AS tabla, c.relrowsecurity AS rls, count(p.polname)::int AS politicas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN information_schema.columns col
      ON col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'colegio_id'
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity
    ORDER BY c.relname`;
  ok(conColegio.length > 0, `hay tablas con colegio_id (${conColegio.length})`);

  // Toda política de una tabla de colegio tiene que condicionar el acceso: o
  // filtra por `colegio_id`, o exige el modo plataforma. Una política sin
  // condición (`true`, `colegio_id IS NULL`, `qual` nulo) deja la tabla abierta.
  const politicas = await sql`
    SELECT p.tablename AS tabla, p.policyname AS politica, p.cmd, p.qual, p.with_check
    FROM pg_policies p
    JOIN information_schema.columns c
      ON c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'colegio_id'
    WHERE p.schemaname = 'public'
    ORDER BY p.tablename, p.policyname`;

  const filtraTenant = (expresion) =>
    typeof expresion === 'string' && expresion.includes('colegio_id');
  const filtraPlataforma = (expresion) =>
    typeof expresion === 'string' && expresion.includes('is_platform_admin');
  const condiciona = (expresion) =>
    (filtraTenant(expresion) || filtraPlataforma(expresion)) && expresion.trim() !== 'true';
  const ESCRIBE = ['ALL', 'INSERT', 'UPDATE'];

  const sinCondicion = politicas.filter(
    (p) =>
      !condiciona(p.qual ?? '') || (ESCRIBE.includes(p.cmd) && !condiciona(p.with_check ?? '')),
  );
  ok(
    sinCondicion.length === 0,
    `toda política filtra por colegio_id o exige modo plataforma (sin condición: ${
      sinCondicion.map((p) => `${p.tabla}.${p.politica}`).join(', ') || 'ninguna'
    })`,
  );

  for (const t of conColegio) {
    const suyas = politicas.filter((p) => p.tabla === t.tabla);
    const aisla = suyas.some((p) => filtraTenant(p.qual ?? '') || filtraTenant(p.with_check ?? ''));
    const aislaEscritura = suyas.some(
      (p) => ESCRIBE.includes(p.cmd) && filtraTenant(p.with_check ?? ''),
    );
    const problemas = [
      t.rls !== true ? 'sin RLS' : null,
      suyas.length === 0 ? 'sin políticas' : null,
      !aisla ? 'sin política que filtre por colegio_id' : null,
      !aislaEscritura ? 'sin WITH CHECK por colegio_id (escritura cruzada)' : null,
    ].filter(Boolean);
    ok(
      problemas.length === 0,
      problemas.length === 0
        ? `${t.tabla}: RLS, ${suyas.length} política(s), filtra y valida colegio_id`
        : `${t.tabla}: ${problemas.join('; ')}`,
    );
  }

  // ── 3. Propiedad ───────────────────────────────────────────────────────────
  seccion('Propiedad de las tablas');
  const duenios = await sql`
    SELECT tableowner AS duenio, array_agg(tablename ORDER BY tablename) AS tablas, count(*)::int AS n
    FROM pg_tables WHERE schemaname = 'public'
    GROUP BY tableowner`;
  const ajenos = duenios.filter((d) => d.duenio !== 'app_migrator');
  ok(
    ajenos.length === 0,
    `todas las tablas son de app_migrator (ajenas: ${ajenos.map((d) => `${d.duenio}:${d.n}`).join(', ') || 'ninguna'})`,
  );

  // ── 4. Privilegios de app_user ─────────────────────────────────────────────
  seccion('Privilegios de app_user');
  const [base] = await sql`SELECT current_database() AS nombre`;
  ok(
    (await sql`SELECT has_database_privilege('app_user', ${base.nombre}, 'CREATE') AS p`)[0].p ===
      false,
    'app_user no puede crear objetos en la base',
  );
  ok(
    (await sql`SELECT has_schema_privilege('app_user', 'public', 'CREATE') AS p`)[0].p === false,
    'app_user no puede crear objetos en el esquema public',
  );
  ok(
    (await sql`SELECT has_schema_privilege('app_user', 'public', 'USAGE') AS p`)[0].p === true,
    'app_user puede usar el esquema public',
  );

  // Los privilegios se consultan por OID de relación: evita resolver nombres y
  // funciona igual con tablas, vistas y particiones.
  const sinLectura = await sql`
    SELECT c.relname AS tabla
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind IN ('r', 'v', 'm')
      AND c.relname NOT IN ${sql(VISTAS)}
      AND NOT has_table_privilege('app_user', c.oid, 'SELECT')
    ORDER BY c.relname`;
  ok(
    sinLectura.length === 0,
    `app_user puede leer todas las tablas (sin SELECT: ${sinLectura.map((t) => t.tabla).join(', ') || 'ninguna'})`,
  );

  const sinEscritura = await sql`
    SELECT c.relname AS tabla
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'colegio_id'
      )
      AND (NOT has_table_privilege('app_user', c.oid, 'INSERT')
        OR NOT has_table_privilege('app_user', c.oid, 'UPDATE')
        OR NOT has_table_privilege('app_user', c.oid, 'DELETE'))
    ORDER BY c.relname`;
  ok(
    sinEscritura.length === 0,
    `app_user puede insertar/actualizar/borrar en las tablas de colegio (sin algún permiso: ${sinEscritura.map((t) => t.tabla).join(', ') || 'ninguna'})`,
  );

  const conDdl = await sql`
    SELECT c.relname AS tabla
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND (has_table_privilege('app_user', c.oid, 'TRUNCATE')
        OR has_table_privilege('app_user', c.oid, 'TRIGGER')
        OR has_table_privilege('app_user', c.oid, 'REFERENCES'))
    ORDER BY c.relname`;
  ok(
    conDdl.length === 0,
    `app_user no tiene TRUNCATE/TRIGGER/REFERENCES (los tiene en: ${conDdl.map((t) => t.tabla).join(', ') || 'ninguna'})`,
  );

  // ── 5. Default ACL ─────────────────────────────────────────────────────────
  seccion('Privilegios por defecto (tablas nuevas)');
  const [defecto] = await sql`
    SELECT coalesce(array_to_string(defaclacl, ' '), '') AS acl
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public' AND pg_get_userbyid(d.defaclrole) = 'app_migrator' AND d.defaclobjtype = 'r'`;
  const acl = defecto?.acl ?? '';
  ok(/app_user=[a-z]*d/.test(acl), `las tablas nuevas dan DML a app_user (acl: ${acl || 'vacía'})`);
  ok(/app_user=[a-z]*r/.test(acl), `las tablas nuevas dan SELECT a app_user`);

  // ── 6. Funciones SECURITY DEFINER ──────────────────────────────────────────
  seccion('Funciones SECURITY DEFINER');
  const definer = await sql`
    SELECT p.proname AS funcion, pg_get_userbyid(p.proowner) AS duenio
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prosecdef = true
    ORDER BY p.proname`;
  const definerAjenas = definer.filter((f) => f.duenio !== 'app_migrator');
  ok(
    definerAjenas.length === 0,
    `las funciones SECURITY DEFINER son de app_migrator (ajenas: ${definerAjenas.map((f) => `${f.funcion}:${f.duenio}`).join(', ') || 'ninguna'})`,
  );

  // ── 7. Vistas pre-tenant ───────────────────────────────────────────────────
  seccion('Vistas pre-tenant');
  for (const vista of VISTAS) {
    const [existe] = await sql`
      SELECT count(*)::int AS n FROM pg_views
      WHERE schemaname = 'public' AND viewname = ${vista}`;
    ok(existe.n === 1, `existe la vista ${vista}`);
    if (existe.n !== 1) continue;

    const columnas = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${vista}`;
    const nombres = columnas.map((c) => c.column_name);
    ok(!nombres.includes('password_hash'), `${vista} no expone password_hash`);

    const [priv] = await sql`
      SELECT has_table_privilege('app_user', c.oid, 'SELECT') AS puede
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname = ${vista}`;
    ok(priv?.puede === true, `${vista} es legible por app_user (por diseño, sin tenant)`);
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log('');
  if (fallos === 0) {
    console.log(`AUDITORÍA OK — ${avisos} aviso(s), 0 fallos.`);
  } else {
    console.log(`AUDITORÍA FALLÓ — ${fallos} fallo(s), ${avisos} aviso(s).`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Error ejecutando la auditoría:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
