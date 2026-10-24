/**
 * Barrel del esquema — re-exporta todas las tablas y tipos del modelo.
 * Los consumidores importan desde '@eduplatform/database' (o '/schema').
 */

export * from './_tenant';
export * from './plataforma-usuarios';
export * from './colegios';
export * from './permisos';
export * from './roles';
export * from './usuarios';
export * from './sesiones';
export * from './estudiantes';
export * from './estructura';
export * from './calificaciones';
export * from './horarios';
export * from './documentos';
export * from './asistencia-audit';
