-- 0007_sin_dominio_email.sql — el subdominio es el único identificador del colegio.
--
-- DESTRUCTIVA: aplicar SOLO después de desplegar el código que ya no lee
-- `dominio_email` (login por subdominio + sufijo del usuario). Con datos
-- existentes antes habría que renombrar `usuarios.usuario` a `usuario@<subdominio>`.
--
-- Recrea la vista pública sin la columna y luego elimina la columna.

DROP VIEW IF EXISTS colegios_publico;
CREATE VIEW colegios_publico AS
  SELECT id, nombre, subdominio, codigo_dane, logo_url, primary_color, estado, municipio, departamento
  FROM colegios;
GRANT SELECT ON colegios_publico TO app_user;

ALTER TABLE colegios DROP COLUMN IF EXISTS dominio_email;
