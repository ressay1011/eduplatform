/**
 * Resolución del subdominio del colegio y utilidades de branding.
 * En producción cada colegio navega `colegio-x.app.dominio.com`; en local
 * se usa `colegio-x.localhost:3000` o el override `?colegio=`.
 */
import { SubdominioSchema } from '@eduplatform/types';

/**
 * Etiquetas que NUNCA son subdominio de un colegio: hosts de la plataforma
 * (`dev`, `www`, `api`…) y entornos de despliegue. Sin esto, entrar por
 * `dev.eduplatform.co` se interpretaba como el colegio «dev» y el login
 * mostraba «No encontramos un colegio en esta dirección».
 */
const RESERVADOS = new Set([
  'www',
  'app',
  'admin',
  'api',
  'dev',
  'staging',
  'preview',
  'qa',
  'test',
  'demo',
]);

/** ¿La etiqueta es de la plataforma (`dev`, `www`, `api-dev`, `dev-2`…)? */
function esHostDePlataforma(etiqueta: string): boolean {
  return RESERVADOS.has(etiqueta) || etiqueta.startsWith('api-') || etiqueta.startsWith('dev-');
}

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
    if (candidato === '' || esHostDePlataforma(candidato)) return null;
    return candidato;
  }

  const partes = host.split('.');

  // 3) Host simple (localhost) o IP (127.0.0.1) → sin subdominio.
  if (partes.length < 3) return null;
  const primero = partes[0];
  if (primero === undefined || primero === '') return null;
  if (/^\d+$/.test(primero)) return null;

  // 4) Prod: colegio-x.app.dominio.com → primer label no reservado.
  if (esHostDePlataforma(primero)) return null;
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
