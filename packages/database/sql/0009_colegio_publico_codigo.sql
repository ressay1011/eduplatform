-- 0009_colegio_publico_codigo.sql — la vista pública del login expone el código.
--
-- Pre-sesión no hay tenant, así que el login lee el colegio por esta vista. Con
-- el código como identificador (y el subdominio de salida) la vista necesita
-- `codigo`; de paso expone las semillas y la paleta, que son datos públicos.
--
-- `subdominio` se mantiene hasta la etapa D, cuando se elimine del todo.
-- Idempotente: DROP + CREATE (CREATE OR REPLACE no permite reordenar columnas).

DROP VIEW IF EXISTS colegios_publico;
CREATE VIEW colegios_publico AS
  SELECT id, codigo, nombre, codigo_dane, logo_url, primary_color, secondary_color, tertiary_color,
         palette, estado, municipio, departamento, subdominio
  FROM colegios;
GRANT SELECT ON colegios_publico TO app_user;
