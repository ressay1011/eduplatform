-- =============================================================================
-- 0000_roles.sql — roles de base de datos (ejecutar como SUPERUSUARIO).
-- En dev lo ejecuta automáticamente el contenedor de docker-compose
-- (docker-entrypoint-initdb.d). En producción, cada entorno (Render/Neon)
-- define sus propios roles y credenciales.
--
--   app_migrator → dueño del esquema: crea tablas y migraciones. NO es superuser.
--   app_user     → runtime de la API: SUJETO a RLS (sin BYPASSRLS).
--
-- Las contraseñas aquí son SOLO de desarrollo local.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator LOGIN PASSWORD 'app_migrator_dev';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_dev';
  END IF;
END
$$;

-- Conexión a la base
GRANT CONNECT ON DATABASE eduplatform TO app_migrator, app_user;

-- Esquema public: el migrator es dueño; app_user solo lo usa (USAGE)
ALTER SCHEMA public OWNER TO app_migrator;
GRANT CREATE ON SCHEMA public TO app_migrator;
GRANT USAGE ON SCHEMA public TO app_user;

-- app_user: DML sobre tablas presentes y FUTURAS creadas por el migrator
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;