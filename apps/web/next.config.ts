import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Configuración de Next — frontend EduPlatform.
 * La API vive aparte (Render en prod; localhost:4000 en dev) y se consume
 * con credenciales (cookies httpOnly) vía NEXT_PUBLIC_API_URL.
 *
 * S7 del informe: cabeceras de seguridad. La CSP va en fase 1 con
 * `'unsafe-inline'` en estilos porque el repo usa atributos `style={{…}}`
 * inline (una CSP con nonce no cubre atributos); endurecerla exige mover
 * esos estilos a globals.css primero.
 */

/** Origen de la API (sin ruta): en CSP las rutas se comparan exactas. */
function origenDe(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/api\/?$/, '');
  }
}

const API_ORIGEN = origenDe(process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/api');

// En desarrollo Next compila con eval (React Refresh y source maps): sin
// 'unsafe-eval' la CSP bloquea el bundle y la página no hidrata. Producción
// sigue sin él.
const SCRIPT_SRC = `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`;

const CSP = [
  "default-src 'self'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  // El origen, no la ruta: `http://host/api` solo casaría con /api exacto.
  `connect-src 'self' ${API_ORIGEN}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Trazado desde la raíz del monorepo (evita inferencias por lockfiles externos).
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // R12: evita que el barrel de TanStack entre completo al bundle.
  experimental: {
    optimizePackageImports: ['@tanstack/react-query'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
