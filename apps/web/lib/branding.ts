/**
 * Branding por colegio — sobreescribe los tokens M3 con el color semilla del
 * colegio (derivación simple; la paleta tonal completa de M3 llegará luego).
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const limpio = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return null;
  return {
    r: parseInt(limpio.slice(0, 2), 16),
    g: parseInt(limpio.slice(2, 4), 16),
    b: parseInt(limpio.slice(4, 6), 16),
  };
}

function aHex({ r, g, b }: Rgb): string {
  const canal = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/** Mezcla `a` hacia `b` con proporción `p` (0 = a, 1 = b). */
function mezclar(a: Rgb, b: Rgb, p: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * p,
    g: a.g + (b.g - a.g) * p,
    b: a.b + (b.b - a.b) * p,
  };
}

/** Aplica el color semilla del colegio a los tokens M3 (no-op si inválido). */
export function aplicarBranding(primaryColor: string | null): void {
  if (primaryColor === null || typeof document === 'undefined') return;
  const rgb = parseHex(primaryColor);
  if (rgb === null) return;

  const blanco: Rgb = { r: 255, g: 255, b: 255 };
  const negro: Rgb = { r: 0, g: 0, b: 0 };
  const luminancia = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;

  const estilo = document.documentElement.style;
  estilo.setProperty('--md-sys-color-primary', aHex(rgb));
  estilo.setProperty('--md-sys-color-on-primary', luminancia < 150 ? '#ffffff' : '#001a41');
  estilo.setProperty('--md-sys-color-primary-container', aHex(mezclar(rgb, blanco, 0.85)));
  estilo.setProperty('--md-sys-color-on-primary-container', aHex(mezclar(rgb, negro, 0.6)));
  estilo.setProperty('--aurora-1', aHex(rgb));
}