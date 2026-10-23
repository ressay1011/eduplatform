-- =============================================================================
-- 0003_roles_seed.sql — roles predeterminados por colegio (módulo Personas).
-- Idempotente: se puede re-ejecutar sin duplicar nada. La RLS de `roles`,
-- `roles_permisos` y `usuarios_sedes` la aplica 0001_rls_policies.sql.
--
-- Reglas:
--   - 5 roles por colegio, editables por el admin; el admin (`es_admin`) no
--     es un rol asignable.
--   - El rol agrupa permisos del catálogo; `usuarios_permisos` se mantiene
--     como proyección que resincroniza la API.
-- =============================================================================

INSERT INTO roles (colegio_id, nombre, descripcion, tipo_persona, es_predeterminado)
SELECT c.id, d.nombre, d.descripcion, d.tipo_persona, true
FROM colegios c
CROSS JOIN (VALUES
  ('Docente',     'Registra notas y asistencia de sus cursos',            'EMPLEADO'),
  ('Estudiante',  'Consulta sus notas, horario y documentos',             'ESTUDIANTE'),
  ('Acudiente',   'Consulta la información de sus hijos',                 'ACUDIENTE'),
  ('Coordinador', 'Supervisa notas, asistencia y horarios del colegio',   'EMPLEADO'),
  ('Secretaría',  'Gestiona estudiantes, matrículas y certificados',      'EMPLEADO')
) AS d(nombre, descripcion, tipo_persona)
ON CONFLICT (colegio_id, nombre) DO NOTHING;

-- Permisos base de cada rol predeterminado (el admin puede ajustarlos).
WITH mapa(rol, codigo) AS (VALUES
  ('Docente',    'calificaciones.ver_propias'),
  ('Docente',    'calificaciones.editar'),
  ('Docente',    'asistencia.registrar'),
  ('Docente',    'asistencia.ver'),
  ('Docente',    'horarios.ver'),
  ('Docente',    'estudiantes.ver'),
  ('Docente',    'portal.consultar'),

  ('Estudiante', 'portal.consultar'),
  ('Estudiante', 'horarios.ver'),

  ('Acudiente',  'portal.consultar'),

  ('Coordinador','calificaciones.ver_todas'),
  ('Coordinador','asistencia.ver'),
  ('Coordinador','horarios.ver'),
  ('Coordinador','horarios.editar'),
  ('Coordinador','grupos.administrar'),
  ('Coordinador','estudiantes.ver'),
  ('Coordinador','documentos.generar'),
  ('Coordinador','documentos.generar_masivo'),
  ('Coordinador','documentos.ver_historial'),

  ('Secretaría', 'estudiantes.ver'),
  ('Secretaría', 'estudiantes.crear'),
  ('Secretaría', 'estudiantes.editar'),
  ('Secretaría', 'estudiantes.importar'),
  ('Secretaría', 'acudientes.administrar'),
  ('Secretaría', 'usuarios.ver'),
  ('Secretaría', 'matriculas.administrar'),
  ('Secretaría', 'documentos.generar'),
  ('Secretaría', 'documentos.ver_historial'),
  ('Secretaría', 'horarios.ver')
)
INSERT INTO roles_permisos (colegio_id, rol_id, permiso_id)
SELECT ro.colegio_id, ro.id, p.id
FROM roles ro
JOIN mapa m ON m.rol = ro.nombre
JOIN permisos p ON p.codigo = m.codigo
ON CONFLICT (rol_id, permiso_id) DO NOTHING;