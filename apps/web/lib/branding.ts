/**
 * Branding por colegio en el navegador.
 *
 * La API entrega la paleta ya resuelta (`PaletaColegio`): roles M3 para claro y
 * oscuro, generados desde los tres colores del colegio con las semillas de
 * EduPlatform como respaldo. Aquí solo se aplican y se guardan para que una
 * recarga no pierda el color: el `<script>` del layout raíz los pinta antes del
 * primer frame leyendo el mismo `localStorage`.
 */
import { generarPaleta, type PaletaColegio } from '@eduplatform/types';

/** Clave de `localStorage` con `{ codigo, paleta }`. */
export const CLAVE_BRANDING = 'eduplatform.branding';

export interface MarcaGuardada {
  /** Código del colegio: permite refrescar la paleta al arrancar. */
  codigo: string;
  paleta: PaletaColegio;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Roles que pisa el colegio (los neutros siguen siendo de la Foundation). */
const ROLES_M3 = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'inversePrimary',
  'surfaceTint',
] as const;

/** `onPrimaryContainer` → `on-primary-container`. */
function aKebab(rol: string): string {
  return rol.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`);
}

/** ¿El sistema operativo pide tema oscuro? (la app sigue al SO). */
export function prefiereOscuro(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Aplica los roles de la paleta como variables CSS del tema pedido. */
export function aplicarPaleta(paleta: PaletaColegio, oscuro = prefiereOscuro()): void {
  if (typeof document === 'undefined') return;
  const roles = oscuro ? paleta.oscuro : paleta.claro;
  const estilo = document.documentElement.style;

  for (const [rol, valor] of Object.entries(roles)) {
    if (typeof valor === 'string' && HEX_RE.test(valor)) {
      estilo.setProperty(`--md-sys-color-${aKebab(rol)}`, valor);
    }
  }

  const primario = roles['primary'];
  if (primario !== undefined && HEX_RE.test(primario)) {
    // Degradado del fondo del login («aurora»).
    estilo.setProperty('--aurora-1', primario);
  }
}

/** Guarda la paleta para pintarla antes de hidratar y para refrescarla luego. */
export function guardarPaleta(codigo: string, paleta: PaletaColegio): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      CLAVE_BRANDING,
      JSON.stringify({ codigo, paleta } satisfies MarcaGuardada),
    );
  } catch {
    // Modo privado o cuota llena: el branding se aplica igual, solo que sin
    // persistencia (se pierde al recargar).
  }
}

/** Lo guardado, o `null` si no hay nada utilizable. */
export function leerPaletaGuardada(): MarcaGuardada | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const crudo = localStorage.getItem(CLAVE_BRANDING);
    if (crudo === null) return null;
    const dato = JSON.parse(crudo) as Partial<MarcaGuardada> | null;
    if (dato === null || typeof dato.codigo !== 'string') return null;
    const paleta = dato.paleta;
    if (paleta === undefined || paleta === null) return null;
    if (typeof paleta.claro !== 'object' || typeof paleta.oscuro !== 'object') return null;
    return { codigo: dato.codigo, paleta };
  } catch {
    return null;
  }
}

/** Aplica lo guardado sin tocar la red (el refresco lo hace el provider). */
export function aplicarGuardado(): void {
  const guardado = leerPaletaGuardada();
  if (guardado !== null) aplicarPaleta(guardado.paleta);
}

/** Quita el branding aplicado y lo guardado (colegio inexistente, p. ej.). */
export function limpiarPaleta(): void {
  if (typeof document !== 'undefined') {
    const estilo = document.documentElement.style;
    for (const rol of ROLES_M3) estilo.removeProperty(`--md-sys-color-${aKebab(rol)}`);
    estilo.removeProperty('--aurora-1');
  }
  try {
    localStorage.removeItem(CLAVE_BRANDING);
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
}

/**
 * Atajo para un colegio con un solo color (o sin paleta en la API): genera la
 * paleta con los defectos de EduPlatform y, si hay código, la guarda.
 */
export function aplicarBranding(primaryColor: string | null, codigo?: string): void {
  if (primaryColor === null) return;
  const paleta = generarPaleta({ primario: primaryColor });
  aplicarPaleta(paleta);
  if (codigo !== undefined) guardarPaleta(codigo, paleta);
}
