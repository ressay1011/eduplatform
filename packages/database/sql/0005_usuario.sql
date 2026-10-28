-- 0005_usuario.sql — el identificador del personal deja de ser un correo.
--
-- El colegio se resuelve por el subdominio del host, así que el acceso se hace
-- con un nombre de usuario (`admin@juanaarias`, `rector.garcia`, la cédula…)
-- que solo tiene que ser único dentro del colegio. Los valores existentes
-- (`admin@colegio.edu.co`) siguen siendo válidos como nombre de usuario.
--
-- Idempotente: se puede correr dos veces sin efecto.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'email'
  ) THEN
    ALTER TABLE usuarios RENAME COLUMN email TO usuario;
  END IF;
END $$;

ALTER INDEX IF EXISTS usuarios_colegio_email_unique RENAME TO usuarios_colegio_usuario_unique;
ALTER INDEX IF EXISTS usuarios_colegio_email_idx RENAME TO usuarios_colegio_usuario_idx;
