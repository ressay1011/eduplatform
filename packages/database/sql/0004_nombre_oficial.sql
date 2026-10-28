-- Nombre completo del establecimiento para documentos oficiales.
--
-- `colegios.nombre` es el nombre corto que ve el usuario en la interfaz
-- («I.E.T.D. Juana Arias de Benavides»); `nombre_oficial` guarda el nombre
-- completo del registro del MEN («INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL
-- JUANA ARIAS DE BENAVIDES»), que es el que va en certificados, actas y
-- diplomas. Nullable: los colegios creados antes de este cambio lo tienen NULL
-- y los documentos caen a `nombre`.

ALTER TABLE colegios ADD COLUMN IF NOT EXISTS nombre_oficial text;

COMMENT ON COLUMN colegios.nombre_oficial IS
  'Nombre completo del MEN para certificados y actas; NULL = usar nombre';
