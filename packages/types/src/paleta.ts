/**
 * Paleta del colegio a partir de tres colores semilla.
 *
 * Reglas de negocio:
 *  - El colegio puede definir uno, dos o los tres colores. El que falte se
 *    toma de EduPlatform (Foundation), no del navegador.
 *  - Con los tres resueltos se genera la paleta completa: nunca se mezcla un
 *    color propio con los roles ya calculados de la Foundation, porque el
 *    contraste entre ellos no está garantizado.
 *  - Los roles neutros (`surface`, `outline`, `onSurface`…) no se tocan: la
 *    interfaz no puede quedar ilegible por una mala elección de color.
 *
 * El cálculo va en CIELAB: el tono M3 es la L* del rol, y el croma se limita
 * por familia (primario más saturado que secundario/terciario) para que los
 * contenedores no salgan fluorescentes. Versión 1.
 */
import type { PaletaColegio } from './branding';

/** Sube cuando cambia el algoritmo: las paletas guardadas con otra se rehacen. */
export const VERSION_PALETA = 1;

/** Semillas por defecto de EduPlatform (los tres colores de la Foundation). */
export const SEMILLAS_EDUPLATFORM = {
  primario: '#0856cf',
  secundario: '#585e71',
  terciario: '#735471',
} as const;

export interface SemillasColegio {
  primario?: string | null | undefined;
  secundario?: string | null | undefined;
  terciario?: string | null | undefined;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  L: number;
  a: number;
  b: number;
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function parseHex(hex: string): Rgb | null {
  if (!HEX_RE.test(hex)) return null;
  const limpio = hex.replace('#', '');
  return {
    r: Number.parseInt(limpio.slice(0, 2), 16),
    g: Number.parseInt(limpio.slice(2, 4), 16),
    b: Number.parseInt(limpio.slice(4, 6), 16),
  };
}

function aLineal(canal: number): number {
  const c = canal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function deLineal(valor: number): number {
  const v = valor <= 0.0031308 ? 12.92 * valor : 1.055 * valor ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

function aHex({ r, g, b }: Rgb): string {
  const canal = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

function rgbALab({ r, g, b }: Rgb): Lab {
  const rl = aLineal(r);
  const gl = aLineal(g);
  const bl = aLineal(b);

  // D65
  const x = 0.4124 * rl + 0.3576 * gl + 0.1805 * bl;
  const y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  const z = 0.0193 * rl + 0.1192 * gl + 0.9505 * bl;

  const xn = 0.95047;
  const yn = 1;
  const zn = 1.08883;
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const f = (t: number): number => (t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116);

  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labARgb({ L, a, b }: Lab): Rgb {
  const yn = 1;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const inv = (t: number): number => {
    const t3 = t ** 3;
    return t3 > epsilon ? t3 : (116 * t - 16) / kappa;
  };

  const x = 0.95047 * inv(fx);
  const y = yn * inv(fy);
  const z = 1.08883 * inv(fz);

  // XYZ → sRGB lineal (D65)
  const rl = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  const gl = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const bl = 0.0557 * x - 0.204 * y + 1.057 * z;

  return { r: deLineal(rl), g: deLineal(gl), b: deLineal(bl) };
}

/** Croma máximo por familia: el primario conserva el suyo (M3 lo permite),
 *  los otros dos acompañan sin competir con él. */
const CROMA_MAXIMO = { primario: Number.POSITIVE_INFINITY, secundario: 16, terciario: 26 } as const;

type Familia = keyof typeof CROMA_MAXIMO;

/** Convierte una semilla en el rol de un tono dado (L* = tono). */
function rolDe(semilla: Lab, familia: Familia, tono: number): string {
  // Blanco y negro puros: sin croma, o el tono 100 sale grisáceo.
  if (tono >= 99) return '#ffffff';
  if (tono <= 1) return '#000000';

  const croma = Math.min(Math.hypot(semilla.a, semilla.b), CROMA_MAXIMO[familia]);
  const angulo = Math.atan2(semilla.b, semilla.a);
  // Los contenedores (90) y los tonos bajos pierden saturación: M3 no usa
  // pasteles fluorescentes.
  const factor = tono >= 85 ? 0.5 : tono <= 15 ? 0.9 : 1;

  return aHex(
    labARgb({
      L: tono,
      a: croma * factor * Math.cos(angulo),
      b: croma * factor * Math.sin(angulo),
    }),
  );
}

function familiaDe(semilla: string, defecto: Familia): Lab {
  const rgb = parseHex(semilla) ?? (parseHex(SEMILLAS_EDUPLATFORM[defecto]) as Rgb);
  return rgbALab(rgb);
}

/** Semilla efectiva: la del colegio si es un color válido, si no la de EduPlatform. */
function semillaValida(valor: string | null | undefined, defecto: string): string {
  if (valor === null || valor === undefined) return defecto;
  const rgb = parseHex(valor);
  return rgb === null ? defecto : aHex(rgb);
}

/** Genera la paleta completa desde las semillas (con los defectos ya resueltos). */
export function generarPaleta(semillas: SemillasColegio): PaletaColegio {
  const semillaPrimaria = semillaValida(semillas.primario, SEMILLAS_EDUPLATFORM.primario);
  const semillaSecundaria = semillaValida(semillas.secundario, SEMILLAS_EDUPLATFORM.secundario);
  const semillaTerciaria = semillaValida(semillas.terciario, SEMILLAS_EDUPLATFORM.terciario);

  const primario = familiaDe(semillaPrimaria, 'primario');
  const secundario = familiaDe(semillaSecundaria, 'secundario');
  const terciario = familiaDe(semillaTerciaria, 'terciario');

  const claro: Record<string, string> = {
    primary: rolDe(primario, 'primario', 40),
    onPrimary: rolDe(primario, 'primario', 100),
    primaryContainer: rolDe(primario, 'primario', 90),
    onPrimaryContainer: rolDe(primario, 'primario', 10),
    secondary: rolDe(secundario, 'secundario', 40),
    onSecondary: rolDe(secundario, 'secundario', 100),
    secondaryContainer: rolDe(secundario, 'secundario', 90),
    onSecondaryContainer: rolDe(secundario, 'secundario', 10),
    tertiary: rolDe(terciario, 'terciario', 40),
    onTertiary: rolDe(terciario, 'terciario', 100),
    tertiaryContainer: rolDe(terciario, 'terciario', 90),
    onTertiaryContainer: rolDe(terciario, 'terciario', 10),
    inversePrimary: rolDe(primario, 'primario', 80),
    surfaceTint: rolDe(primario, 'primario', 40),
  };

  const oscuro: Record<string, string> = {
    primary: rolDe(primario, 'primario', 80),
    onPrimary: rolDe(primario, 'primario', 20),
    primaryContainer: rolDe(primario, 'primario', 30),
    onPrimaryContainer: rolDe(primario, 'primario', 90),
    secondary: rolDe(secundario, 'secundario', 80),
    onSecondary: rolDe(secundario, 'secundario', 20),
    secondaryContainer: rolDe(secundario, 'secundario', 30),
    onSecondaryContainer: rolDe(secundario, 'secundario', 90),
    tertiary: rolDe(terciario, 'terciario', 80),
    onTertiary: rolDe(terciario, 'terciario', 20),
    tertiaryContainer: rolDe(terciario, 'terciario', 30),
    onTertiaryContainer: rolDe(terciario, 'terciario', 90),
    inversePrimary: rolDe(primario, 'primario', 40),
    surfaceTint: rolDe(primario, 'primario', 80),
  };

  return {
    version: VERSION_PALETA,
    generadoEn: new Date().toISOString(),
    semillas: {
      primario: semillaPrimaria,
      secundario: semillaSecundaria,
      terciario: semillaTerciaria,
    },
    claro,
    oscuro,
  };
}

const ROLES_CLARO = [
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

/** Una paleta guardada solo vale si trae todos los roles y la versión actual. */
function paletaGuardadaValida(paleta: PaletaColegio | null | undefined): PaletaColegio | null {
  if (paleta === null || paleta === undefined) return null;
  if (paleta.version !== VERSION_PALETA) return null;
  const claro = paleta.claro;
  const oscuro = paleta.oscuro;
  if (typeof claro !== 'object' || typeof oscuro !== 'object') return null;
  const completo = (mapa: Record<string, string>): boolean =>
    ROLES_CLARO.every((rol) => typeof mapa[rol] === 'string' && HEX_RE.test(mapa[rol]));
  return completo(claro) && completo(oscuro) ? paleta : null;
}

/**
 * Paleta efectiva de un colegio: la guardada si sirve; si no, se genera con
 * las semillas que tenga (las que falten salen de EduPlatform). `null` cuando
 * el colegio no ha elegido ningún color: ahí mandan los tokens CSS.
 */
export function paletaDelColegio(fuente: {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  palette?: PaletaColegio | null;
}): PaletaColegio | null {
  const guardada = paletaGuardadaValida(fuente.palette);
  if (guardada !== null) return guardada;

  const tieneAlguno = [fuente.primaryColor, fuente.secondaryColor, fuente.tertiaryColor].some(
    (color) => color !== null && color !== undefined,
  );
  if (!tieneAlguno) return null;

  return generarPaleta({
    primario: fuente.primaryColor,
    secundario: fuente.secondaryColor,
    terciario: fuente.tertiaryColor,
  });
}
