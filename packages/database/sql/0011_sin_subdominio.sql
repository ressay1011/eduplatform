-- 0011_sin_subdominio.sql — retirada del subdominio (última etapa).
--
-- Se aplica DESPUÉS de desplegar las etapas A–C: el código ya no lee
-- `colegios.subdominio` en ningún sitio (login, onboarding, scripts).
--
-- DESTRUCTIVA: borra la columna. Antes de aplicarla en un entorno con datos,
-- comprobar los identificadores que se van a normalizar (paso 1).
--
-- Plan: docs/planes/2026-11-05-codigo-colegio.md

-- 1. Identificadores al formato `usuario@codigo`.
--    Desde aquí el login resuelve el colegio SOLO por el código del sufijo; una
--    cuenta con sufijo heredado (`carlos@juanaarias.edu.co`) no podría entrar.
--    Se conserva la parte anterior a la primera `@` y se le pone el código.
UPDATE usuarios u
SET usuario = split_part(u.usuario, '@', 1) || '@' || c.codigo
FROM colegios c
WHERE u.colegio_id = c.id
  AND position('@' in u.usuario) > 0
  AND lower(u.usuario) NOT LIKE '%@' || lower(c.codigo);

-- 2. Vista pública sin el campo (el login la lee antes de tener sesión).
DROP VIEW IF EXISTS colegios_publico;
CREATE VIEW colegios_publico AS
  SELECT id, codigo, nombre, codigo_dane, logo_url, primary_color, secondary_color,
         tertiary_color, palette, estado, municipio, departamento
  FROM colegios;
GRANT SELECT ON colegios_publico TO app_user;

-- 3. Fuera la columna, con su índice, su unicidad y su check.
DROP INDEX IF EXISTS colegios_subdominio_idx;
ALTER TABLE colegios DROP CONSTRAINT IF EXISTS colegios_subdominio_no_vacio;
ALTER TABLE colegios DROP CONSTRAINT IF EXISTS colegios_subdominio_unique;
ALTER TABLE colegios DROP COLUMN IF EXISTS subdominio;
