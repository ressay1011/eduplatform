/**
 * Enums del dominio — espejo de los valores usados en la base de datos
 * (MODELO-DATOS.md). Se definen como objetos `as const` para tener:
 *   - el valor runtime (para validaciones y UI)
 *   - el tipo TypeScript derivado (sin duplicar strings)
 */

export const TipoDocumento = {
  CC: 'CC',
  TI: 'TI',
  CE: 'CE',
  RC: 'RC',
  PEP: 'PEP',
  PPT: 'PPT',
} as const;
export type TipoDocumento = (typeof TipoDocumento)[keyof typeof TipoDocumento];

export const EstadoColegio = {
  ACTIVO: 'ACTIVO',
  SUSPENDIDO: 'SUSPENDIDO',
  PRUEBA: 'PRUEBA',
} as const;
export type EstadoColegio = (typeof EstadoColegio)[keyof typeof EstadoColegio];

export const Calendario = {
  /** Calendario A: febrero–noviembre */
  A: 'A',
  /** Calendario B: septiembre–junio */
  B: 'B',
} as const;
export type Calendario = (typeof Calendario)[keyof typeof Calendario];

/** Rol fijo del nivel plataforma (los colegios usan permisos granulares, ADR-003). */
export const RolPlataforma = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SOPORTE: 'SOPORTE',
} as const;
export type RolPlataforma = (typeof RolPlataforma)[keyof typeof RolPlataforma];

/** Alcance de un permiso asignado (ADR-004). */
export const AlcancePermiso = {
  TODAS_LAS_SEDES: 'TODAS_LAS_SEDES',
  SEDES_ESPECIFICAS: 'SEDES_ESPECIFICAS',
  MIS_GRUPOS: 'MIS_GRUPOS',
  MIS_CARGAS: 'MIS_CARGAS',
} as const;
export type AlcancePermiso = (typeof AlcancePermiso)[keyof typeof AlcancePermiso];

/** Estados de un estudiante (SIMAT). */
export const EstadoEstudiante = {
  INSCRITO: 'INSCRITO',
  MATRICULADO: 'MATRICULADO',
  RETIRADO: 'RETIRADO',
  GRADUADO: 'GRADUADO',
} as const;
export type EstadoEstudiante = (typeof EstadoEstudiante)[keyof typeof EstadoEstudiante];

export const EstadoPeriodo = {
  PENDIENTE: 'PENDIENTE',
  ACTIVO: 'ACTIVO',
  CERRADO: 'CERRADO',
} as const;
export type EstadoPeriodo = (typeof EstadoPeriodo)[keyof typeof EstadoPeriodo];

export const Jornada = {
  MANANA: 'MANANA',
  TARDE: 'TARDE',
  UNICA: 'UNICA',
  NOCTURNA: 'NOCTURNA',
  FIN_SEMANA: 'FIN_SEMANA',
} as const;
export type Jornada = (typeof Jornada)[keyof typeof Jornada];

export const CondicionMatricula = {
  NUEVO: 'NUEVO',
  ANTIGUO: 'ANTIGUO',
  REPITENTE: 'REPITENTE',
  REINGRESO: 'REINGRESO',
  TRASLADADO: 'TRASLADADO',
} as const;
export type CondicionMatricula = (typeof CondicionMatricula)[keyof typeof CondicionMatricula];

/** Niveles de desempeño del Decreto 1290 (rangos por defecto; editables por SIEE). */
export const NivelDesempeno = {
  SUPERIOR: 'SUPERIOR',
  ALTO: 'ALTO',
  BASICO: 'BASICO',
  BAJO: 'BAJO',
} as const;
export type NivelDesempeno = (typeof NivelDesempeno)[keyof typeof NivelDesempeno];

export const TipoBloque = {
  CLASE: 'CLASE',
  DESCANSO: 'DESCANSO',
  ALMUERZO: 'ALMUERZO',
} as const;
export type TipoBloque = (typeof TipoBloque)[keyof typeof TipoBloque];

export const EstadoAsistencia = {
  PRESENTE: 'PRESENTE',
  AUSENTE: 'AUSENTE',
  AUSENTE_JUSTIFICADO: 'AUSENTE_JUSTIFICADO',
  TARDE: 'TARDE',
} as const;
export type EstadoAsistencia = (typeof EstadoAsistencia)[keyof typeof EstadoAsistencia];

export const TipoCertificado = {
  MATRICULA: 'MATRICULA',
  ESTUDIO: 'ESTUDIO',
  PROMOCION: 'PROMOCION',
  CONSTANCIA: 'CONSTANCIA',
  BOLETIN: 'BOLETIN',
} as const;
export type TipoCertificado = (typeof TipoCertificado)[keyof typeof TipoCertificado];

/** Cómo se cerró un período de notas. */
export const TipoCierre = {
  AUTOMATICO: 'AUTOMATICO',
  MANUAL_ANTICIPADO: 'MANUAL_ANTICIPADO',
  MANUAL_REAPERTURA: 'MANUAL_REAPERTURA',
} as const;
export type TipoCierre = (typeof TipoCierre)[keyof typeof TipoCierre];