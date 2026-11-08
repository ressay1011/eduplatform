-- Jornadas que el MEN publica para el establecimiento (dataset DEPA).
--
-- Se guardan como SUGERENCIA del paso de sedes: así el wizard las propone
-- también al recargar, sin volver a consultar datos.gov.co y sin perderlas
-- cuando el admin cierra sesión a mitad de la configuración.
ALTER TABLE colegios
  ADD COLUMN IF NOT EXISTS jornadas_men text[];
