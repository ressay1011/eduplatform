-- Ubicación de cada sede.
--
-- Una institución puede tener sedes fuera del municipio del colegio (veredas de
-- al lado, otro casco urbano). La dirección sola no dice dónde está: se guarda
-- el municipio y el departamento de la sede. Vacío = la del colegio.
ALTER TABLE sedes
  ADD COLUMN IF NOT EXISTS municipio text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS departamento text NOT NULL DEFAULT '';
