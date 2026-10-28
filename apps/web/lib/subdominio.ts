/**
 * Resolución del subdominio del colegio y utilidades de branding.
 * En producción cada colegio navega `colegio-x.app.dominio.com`; en local
 * se usa `colegio-x.localhost:3000` o el override `?colegio=`.
 */
import { SubdominioSchema } from '@eduplatform/types';

/** Labels que nunca son subdominio de colegio. */
const RESERVADOS = new Set(['www', 'app', 'admin', 'api']);

export function resolverSubdominio(hostname: string, colegioParam: string | null): string | null {
  // 1) Override de desarrollo (?colegio=<subdominio>) — solo si es válido.
  const override = colegioParam?.trim().toLowerCase();
  if (override !== undefined && override !== '' && SubdominioSchema.safeParse(override).success) {
    return override;
  }

  const host = hostname.toLowerCase();

  // 2) Dev: colegio-x.localhost
  if (host.endsWith('.localhost')) {
    const candidato = host.slice(0, -'.localhost'.length);
    return candidato === '' ? null : candidato;
  }

  const partes = host.split('.');

  // 3) Host simple (localhost) o IP (127.0.0.1) → sin subdominio.
  if (partes.length < 3) return null;
  const primero = partes[0];
  if (primero === undefined || primero === '') return null;
  if (/^\d+$/.test(primero)) return null;

  // 4) Prod: colegio-x.app.dominio.com → primer label no reservado.
  if (RESERVADOS.has(primero)) return null;
  return primero;
}

/**
 * Subdominio del colegio según la URL actual del navegador.
 * Devuelve null en el dominio pelado (o sin navegador, en SSR).
 */
export function subdominioActual(): string | null {
  if (typeof window === 'undefined') return null;
  return resolverSubdominio(
    window.location.hostname,
    new URLSearchParams(window.location.search).get('colegio'),
  );
}

/** Iniciales para el avatar del colegio ("Colegio Norte" → "CN"). */
export function inicialesDe(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  const iniciales = palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return iniciales.join('') || '?';
}
