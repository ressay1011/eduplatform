/**
 * Utilidades puras del módulo Personas.
 * Se separan de los componentes para poder probarlas sin render.
 */
import type { PermisoCatalogoItem } from '@eduplatform/types';

/** Grupo de permisos de un módulo, para el editor de rol. */
export interface GrupoPermisos {
  modulo: string;
  permisos: PermisoCatalogoItem[];
}

const NOMBRES_MODULO: Record<string, string> = {
  configuracion: 'Configuración',
  usuarios: 'Personas',
  estructura: 'Estructura académica',
  calificaciones: 'Calificaciones',
  horarios: 'Horarios',
  documentos: 'Documentos',
  asistencia: 'Asistencia',
  auditoria: 'Auditoría',
  portal: 'Portal',
};

/** Agrupa el catálogo por módulo, en el orden del catálogo. */
export function agruparPermisos(catalogo: readonly PermisoCatalogoItem[]): GrupoPermisos[] {
  const grupos = new Map<string, PermisoCatalogoItem[]>();
  for (const permiso of catalogo) {
    const actuales = grupos.get(permiso.modulo) ?? [];
    actuales.push(permiso);
    grupos.set(permiso.modulo, actuales);
  }
  return [...grupos.entries()].map(([modulo, permisos]) => ({ modulo, permisos }));
}

/** Nombre legible de un módulo del catálogo. */
export function nombreModulo(modulo: string): string {
  return NOMBRES_MODULO[modulo] ?? modulo;
}

/** Texto del alcance para la tabla de empleados (el diseño dice «Todas»). */
export function textoAlcance(alcance: 'TODAS' | 'ESPECIFICAS', sedes: readonly string[]): string {
  if (alcance === 'TODAS') return 'Todas';
  if (sedes.length === 0) return 'Sin sede asignada';
  return sedes.join(', ');
}

/** Iniciales para el avatar circular de una persona. */
export function iniciales(nombres: string, apellidos: string): string {
  const primera = nombres.trim().charAt(0);
  const segunda = apellidos.trim().charAt(0);
  return `${primera}${segunda}`.toUpperCase();
}