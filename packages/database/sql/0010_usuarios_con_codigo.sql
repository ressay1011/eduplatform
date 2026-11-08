-- 0010_usuarios_con_codigo.sql — todos los usuarios llevan su código.
--
-- Desde la etapa B el colegio se resuelve solo por el código del identificador
-- (`juan@juanaArias`), sin mirar el host. Los usuarios creados desde la app
-- quedaron SIN sufijo (`juan`) y solo podían entrar por la URL del colegio: sin
-- este relleno se quedarían afuera.
--
-- Idempotente: solo toca los que no tienen `@`. Si un usuario ya lleva sufijo
-- (aunque sea un correo, `x@gmail.com`), se le añade el código al final y el
-- login sigue tomando el último segmento: `x@gmail.com@juanaArias`.

UPDATE usuarios u
SET usuario = u.usuario || '@' || c.codigo
FROM colegios c
WHERE u.colegio_id = c.id
  AND u.usuario NOT LIKE '%@%';
