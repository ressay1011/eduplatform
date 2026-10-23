-- =============================================================================
-- 0002_seed_permisos.sql — catálogo de permisos del MVP (ADR-003).
-- 36 permisos con formato `modulo.accion`. Idempotente (ON CONFLICT DO NOTHING).
-- El admin del colegio los ASIGNA (usuarios_permisos); nunca los crea.
-- =============================================================================

INSERT INTO permisos (codigo, nombre, descripcion, modulo, accion) VALUES
  -- configuracion
  ('configuracion.ver',            'Ver configuración',          'Ver la configuración del colegio',                            'configuracion', 'ver'),
  ('configuracion.editar',         'Editar configuración',       'Editar datos generales, escala y períodos',                   'configuracion', 'editar'),
  ('sedes.administrar',            'Administrar sedes',          'Crear y editar sedes del colegio',                            'configuracion', 'administrar'),
  ('anios.administrar',            'Administrar años lectivos',  'Crear, activar y cerrar años lectivos y períodos',            'configuracion', 'administrar'),
  ('grados.administrar',           'Administrar grados',         'Habilitar los grados que ofrece el colegio',                  'configuracion', 'administrar'),
  ('areas.administrar',            'Administrar áreas',          'Crear y editar áreas académicas',                             'configuracion', 'administrar'),
  ('asignaturas.administrar',      'Administrar asignaturas',    'Crear y editar asignaturas',                                  'configuracion', 'administrar'),
  ('aulas.administrar',            'Administrar aulas',          'Crear y editar aulas',                                        'configuracion', 'administrar'),
  ('plantillas.administrar',       'Administrar plantillas',     'Editar las plantillas de documentos',                         'configuracion', 'administrar'),
  -- usuarios
  ('usuarios.ver',                 'Ver usuarios',               'Ver la lista de usuarios del colegio',                        'usuarios', 'ver'),
  ('usuarios.crear',               'Crear usuarios',             'Crear usuarios e invitaciones',                               'usuarios', 'crear'),
  ('usuarios.editar',              'Editar usuarios',            'Editar datos, asignar permisos y resetear contraseñas',       'usuarios', 'editar'),
  ('usuarios.desactivar',          'Desactivar usuarios',        'Activar y desactivar usuarios',                               'usuarios', 'eliminar'),
  ('estudiantes.ver',              'Ver estudiantes',            'Ver el listado de estudiantes',                               'usuarios', 'ver'),
  ('estudiantes.crear',            'Crear estudiantes',          'Crear estudiantes individualmente',                           'usuarios', 'crear'),
  ('estudiantes.editar',           'Editar estudiantes',         'Editar datos de estudiantes',                                 'usuarios', 'editar'),
  ('estudiantes.importar',         'Importar estudiantes',       'Carga masiva de estudiantes por CSV',                         'usuarios', 'importar'),
  ('acudientes.administrar',       'Administrar acudientes',     'CRUD de acudientes y su vínculo con estudiantes',             'usuarios', 'administrar'),
  -- estructura
  ('grupos.administrar',           'Administrar grupos',         'Crear y editar grupos del año',                               'estructura', 'administrar'),
  ('matriculas.administrar',       'Administrar matrículas',     'Matricular, retirar y trasladar estudiantes',                 'estructura', 'administrar'),
  ('cargas.administrar',           'Administrar cargas',         'Asignar docente–asignatura–grupo',                            'estructura', 'administrar'),
  ('promocion.administrar',        'Administrar promoción',      'Cierre de año y promoción de estudiantes',                    'estructura', 'administrar'),
  -- calificaciones
  ('calificaciones.ver_propias',   'Ver mis cargas',             'Ver sus propias cargas académicas y notas',                   'calificaciones', 'ver'),
  ('calificaciones.editar',        'Registrar calificaciones',   'Registrar evaluaciones y notas (con el período abierto)',     'calificaciones', 'editar'),
  ('calificaciones.ver_todas',     'Ver todas las notas',        'Ver notas de cualquier grupo (supervisión)',                  'calificaciones', 'ver'),
  ('calificaciones.cerrar_anticipado', 'Cerrar período anticipado', 'Forzar el cierre de un período antes de la fecha',        'calificaciones', 'cerrar'),
  ('calificaciones.reabrir',       'Reabrir período',            'Reabrir un período cerrado (dentro de la ventana permitida)', 'calificaciones', 'reabrir'),
  -- horarios
  ('horarios.ver',                 'Ver horarios',               'Ver horarios del colegio',                                    'horarios', 'ver'),
  ('horarios.editar',              'Editar horarios',            'Construir y editar horarios y bloques',                       'horarios', 'editar'),
  -- documentos
  ('documentos.generar',           'Generar certificados',       'Generar certificados individuales',                           'documentos', 'generar'),
  ('documentos.generar_masivo',    'Generación masiva',          'Generación masiva de documentos (boletines por grupo)',       'documentos', 'generar_masivo'),
  ('documentos.ver_historial',     'Ver historial',              'Ver el historial de certificados emitidos',                   'documentos', 'ver'),
  -- asistencia
  ('asistencia.registrar',         'Registrar asistencia',       'Registrar la asistencia diaria (si el módulo está activo)',   'asistencia', 'crear'),
  ('asistencia.ver',               'Ver asistencia',             'Ver reportes de asistencia',                                  'asistencia', 'ver'),
  -- auditoria
  ('auditoria.ver',                'Ver auditoría',              'Ver el registro de auditoría del colegio',                    'auditoria', 'ver'),
  -- portal
  ('portal.consultar',             'Portal de consulta',         'Acceso del estudiante/acudiente a sus propios datos',         'portal', 'consultar')
ON CONFLICT (codigo) DO NOTHING;