'use client';

/**
 * Encabezado del módulo Personas, común a las seis pantallas del diseño:
 * enlace «Volver» (en formularios y editor), título Fraunces 28, subtítulo,
 * acción primaria y, cuando aplica, las pestañas.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PersonasTabs } from './PersonasTabs';

export interface PersonasHeaderProps {
  titulo: string;
  subtitulo: string;
  /** Acción primaria (botón azul de 40 px). */
  accion?: { texto: string; icono?: string; onClick: () => void; deshabilitada?: boolean };
  /** Enlace superior «← Volver a …». */
  volver?: { href: string; texto: string };
  /** Las pantallas de listado muestran pestañas; formularios y editor no. */
  tabs?: boolean;
  children?: ReactNode;
}

export function PersonasHeader({
  titulo,
  subtitulo,
  accion,
  volver,
  tabs = false,
  children,
}: PersonasHeaderProps) {
  return (
    <div className="per-bloque">
      {volver !== undefined ? (
        <Link href={volver.href} className="per-volver">
          <span className="material-symbols-outlined" aria-hidden="true">
            arrow_back
          </span>
          {volver.texto}
        </Link>
      ) : null}

      <div className="per-header">
        <div className="per-titulos">
          <h1>{titulo}</h1>
          <p>{subtitulo}</p>
        </div>
        {accion !== undefined ? (
          <div className="per-acciones">
            <button
              type="button"
              className="per-btn"
              onClick={accion.onClick}
              disabled={accion.deshabilitada === true}
            >
              {accion.icono !== undefined ? (
                <span className="material-symbols-outlined" aria-hidden="true">
                  {accion.icono}
                </span>
              ) : null}
              {accion.texto}
            </button>
          </div>
        ) : null}
      </div>

      {tabs ? <PersonasTabs /> : null}
      {children}
    </div>
  );
}