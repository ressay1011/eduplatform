-- 0008_codigo_colegio.sql — código del colegio y columnas de la paleta.
--
-- ADITIVA e IDEMPOTENTE: se aplica sobre una base en uso sin cambiar el
-- comportamiento. El login sigue resolviendo por subdominio hasta que el código
-- lo reemplace (etapa B del plan docs/planes/2026-11-05-codigo-colegio.md).
--
--   codigo           identificador estable del colegio (lo crea el admin de
--                    plataforma, nunca se edita). Arma los usuarios: admin@<codigo>
--   secondary_color  segunda semilla de la paleta (M3)
--   tertiary_color   tercera semilla de la paleta (M3)
--   palette          paleta resuelta (claro y oscuro) para inyectar en las
--                    variables --md-sys-color-*
--
-- Los índices van aquí y no en el esquema de Drizzle a propósito: son
-- funcionales (`lower(...)`) y drizzle-kit los compararía mal en cada push.

-- 1. El código: se rellena con el subdominio actual, así los usuarios que ya
--    existen (`admin@juanaarias`) siguen funcionando sin tocar nada.
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS codigo text;
UPDATE colegios SET codigo = subdominio WHERE codigo IS NULL OR codigo = '';
ALTER TABLE colegios ALTER COLUMN codigo SET NOT NULL;

-- 2. La caja no distingue: juanaArias y JuanaArias son el mismo colegio.
CREATE UNIQUE INDEX IF NOT EXISTS colegios_codigo_unico ON colegios (lower(codigo));

-- 3. Un colegio nunca puede tener dos usuarios que solo difieran en la caja.
--    Si esta línea falla, hay duplicados que resolver a mano antes de seguir.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_colegio_usuario_sin_caja
  ON usuarios (colegio_id, lower(usuario));

-- 4. Semillas y paleta del colegio.
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS secondary_color text;
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS tertiary_color text;
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS palette jsonb;
