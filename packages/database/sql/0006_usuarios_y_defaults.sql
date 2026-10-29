-- 0006_usuarios_y_defaults.sql — alta manual de colegios y datos personales opcionales.
--
-- Un colegio se crea desde la BD con `id` + `subdominio`: el resto de columnas
-- obligatorias de texto llevan `''` por defecto y el calendario 'A'. En
-- `usuarios` la credencial sigue siendo obligatoria (no vacía) pero los datos
-- personales se completan después.
--
-- Solo ADITIVA/RELAJANTE: se puede aplicar con el código viejo en producción.
-- Idempotente.

ALTER TABLE colegios ALTER COLUMN nombre SET DEFAULT '';
ALTER TABLE colegios ALTER COLUMN municipio SET DEFAULT '';
ALTER TABLE colegios ALTER COLUMN departamento SET DEFAULT '';
ALTER TABLE colegios ALTER COLUMN email SET DEFAULT '';
ALTER TABLE colegios ALTER COLUMN calendario SET DEFAULT 'A';
ALTER TABLE colegios ALTER COLUMN codigo_dane DROP NOT NULL;

ALTER TABLE usuarios ALTER COLUMN nombres DROP NOT NULL;
ALTER TABLE usuarios ALTER COLUMN apellidos DROP NOT NULL;
ALTER TABLE usuarios ALTER COLUMN tipo_documento DROP NOT NULL;
ALTER TABLE usuarios ALTER COLUMN numero_documento DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colegios_subdominio_no_vacio') THEN
    ALTER TABLE colegios ADD CONSTRAINT colegios_subdominio_no_vacio CHECK (subdominio <> '') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_usuario_no_vacio') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_usuario_no_vacio CHECK (usuario <> '') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_password_no_vacio') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_password_no_vacio CHECK (password_hash <> '') NOT VALID;
  END IF;
END $$;

ALTER TABLE colegios VALIDATE CONSTRAINT colegios_subdominio_no_vacio;
ALTER TABLE usuarios VALIDATE CONSTRAINT usuarios_usuario_no_vacio;
ALTER TABLE usuarios VALIDATE CONSTRAINT usuarios_password_no_vacio;
