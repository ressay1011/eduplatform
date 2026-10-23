/**
 * Smoke test del esquema: las 31 tablas del modelo existen y usan nombres
 * snake_case exactos (coincidentes con MODELO-DATOS.md). Este test también
 * garantiza que el barrel importa sin ciclos ni errores.
 */

import { describe, it, expect } from 'vitest';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../schema';

const TABLAS: Array<[string, unknown]> = [
  ['plataforma_usuarios', schema.plataformaUsuarios],
  ['colegios', schema.colegios],
  ['configuracion_colegio', schema.configuracionColegio],
  ['sedes', schema.sedes],
  ['permisos', schema.permisos],
  ['usuarios', schema.usuarios],
  ['usuarios_permisos', schema.usuariosPermisos],
  ['tipos_usuario', schema.tiposUsuario],
  ['usuarios_tipos', schema.usuariosTipos],
  ['estudiantes', schema.estudiantes],
  ['acudientes_estudiantes', schema.acudientesEstudiantes],
  ['anios_lectivos', schema.aniosLectivos],
  ['periodos', schema.periodos],
  ['grados', schema.grados],
  ['grupos', schema.grupos],
  ['areas', schema.areas],
  ['asignaturas', schema.asignaturas],
  ['docentes_asignaturas_grupos', schema.docentesAsignaturasGrupos],
  ['matriculas', schema.matriculas],
  ['evaluaciones', schema.evaluaciones],
  ['calificaciones', schema.calificaciones],
  ['notas_periodo', schema.notasPeriodo],
  ['promociones', schema.promociones],
  ['aulas', schema.aulas],
  ['bloques_horarios', schema.bloquesHorarios],
  ['horarios', schema.horarios],
  ['plantillas_certificados', schema.plantillasCertificados],
  ['certificados', schema.certificados],
  ['asistencias_diarias', schema.asistenciasDiarias],
  ['audit_log', schema.auditLog],
  ['sesiones', schema.sesiones],
];

describe('esquema de base de datos', () => {
  it.each(TABLAS)('la tabla "%s" existe con su nombre snake_case', (nombre, tabla) => {
    expect(getTableName(tabla as never)).toBe(nombre);
  });

  it('exporta exactamente 34 tablas (modelo + roles + auditoría + asistencia)', () => {
      const tablas = Object.values(schema).filter((v) => is(v, PgTable));
      expect(tablas).toHaveLength(34);
    });
});