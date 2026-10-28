-- =============================================================================
-- 0001_rls_policies.sql — Row Level Security (ADR-002).
-- Ejecutar como app_migrator (dueño del esquema) DESPUÉS de crear las tablas
-- (`pnpm db:push`). Es IDEMPOTENTE: se puede re-ejecutar sin error.
--
-- Reglas:
--   - Cada tabla tenant-scoped lleva colegio_id y una política de aislamiento:
--       colegio_id = current_setting('app.current_tenant', true)::uuid
--   - Super-admin de plataforma (cross-tenant): app.is_platform_admin = 'true'
--     (ambos se setean con SET LOCAL dentro de `withTenant`, nunca por request).
--   - El runtime de la API usa el rol app_user → RLS SIEMPRE aplica.
--     (app_migrator es dueño y NO está sujeto a RLS: solo para migraciones.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tablas tenant estándar (colegio_id NOT NULL)
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sedes', 'configuracion_colegio', 'usuarios', 'usuarios_permisos',
    'usuarios_sedes', 'roles', 'roles_permisos',
    'tipos_usuario', 'usuarios_tipos', 'estudiantes', 'acudientes_estudiantes',
    'anios_lectivos', 'periodos', 'grados', 'grupos', 'areas', 'asignaturas',
    'docentes_asignaturas_grupos', 'matriculas', 'evaluaciones', 'calificaciones',
    'notas_periodo', 'promociones', 'aulas', 'bloques_horarios', 'horarios',
    'plantillas_certificados', 'certificados', 'asistencias_diarias',
    'sesiones'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_policy', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (colegio_id = current_setting(''app.current_tenant'', true)::uuid) WITH CHECK (colegio_id = current_setting(''app.current_tenant'', true)::uuid)',
      t || '_tenant_policy', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_platform_policy', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (current_setting(''app.is_platform_admin'', true) = ''true'') WITH CHECK (current_setting(''app.is_platform_admin'', true) = ''true'')',
      t || '_platform_policy', t
    );
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2) audit_log — colegio_id nullable (acciones de plataforma sin colegio)
-- ---------------------------------------------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant_policy ON audit_log;
CREATE POLICY audit_log_tenant_policy ON audit_log FOR ALL
  USING (colegio_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (colegio_id = current_setting('app.current_tenant', true)::uuid);
DROP POLICY IF EXISTS audit_log_platform_policy ON audit_log;
CREATE POLICY audit_log_platform_policy ON audit_log FOR ALL
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');

-- ---------------------------------------------------------------------------
-- 3) colegios — el tenant se ve a sí mismo; la plataforma ve todos
-- ---------------------------------------------------------------------------
ALTER TABLE colegios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS colegios_self_policy ON colegios;
CREATE POLICY colegios_self_policy ON colegios FOR ALL
  USING (id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (id = current_setting('app.current_tenant', true)::uuid);
DROP POLICY IF EXISTS colegios_platform_policy ON colegios;
CREATE POLICY colegios_platform_policy ON colegios FOR ALL
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');

-- ---------------------------------------------------------------------------
-- 4) plataforma_usuarios — solo nivel plataforma
-- ---------------------------------------------------------------------------
ALTER TABLE plataforma_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plataforma_usuarios_policy ON plataforma_usuarios;
CREATE POLICY plataforma_usuarios_policy ON plataforma_usuarios FOR ALL
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');

-- ---------------------------------------------------------------------------
-- 5) permisos — catálogo global: lectura abierta, escritura solo plataforma
-- ---------------------------------------------------------------------------
ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permisos_read_policy ON permisos;
CREATE POLICY permisos_read_policy ON permisos FOR SELECT USING (true);
DROP POLICY IF EXISTS permisos_write_policy ON permisos;
CREATE POLICY permisos_write_policy ON permisos FOR ALL
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');

-- ---------------------------------------------------------------------------
-- 6) Vistas de autenticación (pre-tenant) — propiedad de app_migrator.
-- El login y la validación de sesión ocurren ANTES de conocer el colegio
-- activo, así que RLS todavía no puede aplicarse. Estas vistas exponen SOLO
-- las columnas necesarias y app_user recibe únicamente SELECT.
-- ---------------------------------------------------------------------------
-- Nota: DROP + CREATE (no CREATE OR REPLACE) porque este último solo permite
-- añadir columnas AL FINAL; los cambios de orden/medio exigen recrear.
DROP VIEW IF EXISTS colegios_publico;
CREATE VIEW colegios_publico AS
  SELECT id, nombre, subdominio, codigo_dane, logo_url, primary_color, estado, municipio, departamento
  FROM colegios;
GRANT SELECT ON colegios_publico TO app_user;

DROP VIEW IF EXISTS sesiones_auth;
CREATE VIEW sesiones_auth AS
  SELECT id, colegio_id, usuario_id, plataforma_usuario_id, token_hash, expira_en, revocada_en, ultima_actividad_en
  FROM sesiones;
GRANT SELECT ON sesiones_auth TO app_user;