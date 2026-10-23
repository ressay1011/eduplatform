'use client';

/**
 * PermisosPicker — selector de permisos agrupado por módulo (ADR-003).
 * Cada grupo permite marcar/desmarcar todos los permisos de ese módulo.
 */
import { useMemo } from 'react';
import type { PermisoCatalogoItem } from '@eduplatform/types';

interface PermisosPickerProps {
  catalogo: PermisoCatalogoItem[];
  seleccionados: string[];
  onChange: (permisos: string[]) => void;
  disabled?: boolean;
}

/** Nombre visible del módulo (el catálogo usa la clave interna). */
const NOMBRE_MODULO: Record<string, string> = {
  asistencia: 'Asistencia',
  auditoria: 'Auditoría',
  calificaciones: 'Calificaciones',
  configuracion: 'Configuración',
  documentos: 'Documentos',
  estructura: 'Estructura académica',
  horarios: 'Horarios',
  portal: 'Portal de consulta',
  usuarios: 'Personas y usuarios',
};

export function PermisosPicker({
  catalogo,
  seleccionados,
  onChange,
  disabled = false,
}: PermisosPickerProps) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, PermisoCatalogoItem[]>();
    for (const permiso of catalogo) {
      const actuales = mapa.get(permiso.modulo) ?? [];
      actuales.push(permiso);
      mapa.set(permiso.modulo, actuales);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalogo]);

  const alternar = (codigo: string): void => {
    onChange(
      seleccionados.includes(codigo)
        ? seleccionados.filter((item) => item !== codigo)
        : [...seleccionados, codigo],
    );
  };

  const alternarModulo = (codigos: string[], marcar: boolean): void => {
    if (marcar) {
      const faltantes = codigos.filter((codigo) => !seleccionados.includes(codigo));
      onChange([...seleccionados, ...faltantes]);
    } else {
      onChange(seleccionados.filter((codigo) => !codigos.includes(codigo)));
    }
  };

  return (
    <div className="permisos-grid">
      {grupos.map(([modulo, permisosDelModulo]) => {
        const codigos = permisosDelModulo.map((permiso) => permiso.codigo);
        const todos = codigos.every((codigo) => seleccionados.includes(codigo));
        return (
          <section
            key={modulo}
            className="permiso-grupo"
            aria-label={NOMBRE_MODULO[modulo] ?? modulo}
          >
            <div className="permiso-grupo-header">
              <p className="m3-label-large" style={{ margin: 0 }}>
                {NOMBRE_MODULO[modulo] ?? modulo}
              </p>
              <button
                type="button"
                className="m3-btn m3-btn-text"
                style={{ minHeight: 32, padding: '0 8px' }}
                onClick={() => alternarModulo(codigos, !todos)}
                disabled={disabled}
              >
                <span className="m3-label-medium">{todos ? 'Quitar todos' : 'Marcar todos'}</span>
              </button>
            </div>
            {permisosDelModulo.map((permiso) => (
              <label key={permiso.codigo} className="permiso-item m3-body-small">
                <input
                  type="checkbox"
                  checked={seleccionados.includes(permiso.codigo)}
                  onChange={() => alternar(permiso.codigo)}
                  disabled={disabled}
                />
                <span>
                  {permiso.nombre}
                  <span className="m3-body-small" style={{ opacity: 0.6 }}>
                    {' '}
                    · {permiso.codigo}
                  </span>
                </span>
              </label>
            ))}
          </section>
        );
      })}
    </div>
  );
}
