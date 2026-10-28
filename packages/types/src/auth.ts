/**
 * Esquemas Zod del flujo de autenticación — compartidos entre web (formularios)
 * y api (validación de entrada). AGENTS.md §1.3: validación runtime con Zod.
 */

import { z } from 'zod';
import type { EstadoColegio, RolPlataforma } from './entities/enums';

/**
 * Correo electrónico (normalizado a minúsculas y sin espacios).
 * El login unificado identifica el colegio por lo que va después de la @.
 */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Correo electrónico inválido')
  .max(254);

/**
 * Request del login multipasos (paso 2).
 * El colegio ya se resolvió en el paso 1 a partir del dominio del correo.
 */
/**
 * Subdominio de colegio (usado en la landing pública y al crear colegios).
 * Formato: minúsculas, números y guiones; 3–32 caracteres; no empieza ni
 * termina en guion (evita subdominios inválidos para DNS).
 */
export const SubdominioSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/,
    'Usa minúsculas, números y guiones (3–32 caracteres, sin empezar/terminar en guion)',
  );
export type Subdominio = z.infer<typeof SubdominioSchema>;

/**
 * Nombre de usuario: el identificador de acceso del personal del colegio.
 *
 * NO es un correo. El colegio se resuelve por el subdominio del host, así que
 * el identificador solo tiene que ser único dentro del colegio; se admiten
 * letras, números, punto, guion, guion bajo y `@` (p. ej. `admin@juanaarias`).
 */
export const UsuarioSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(64, 'Máximo 64 caracteres')
  .regex(/^[a-z0-9](?:[a-z0-9._@-]*[a-z0-9])$/, 'Solo minúsculas, números, puntos, guiones y @');

/**
 * Login de usuario de colegio.
 *
 * `subdominio` es opcional: cuando la web se sirve en `colegio.<dominio>` el
 * tenant ya se conoce por el host y el usuario solo se identifica a sí mismo.
 * Sin él se mantiene la resolución heredada por dominio del identificador.
 */
export const LoginRequestSchema = z.object({
  usuario: UsuarioSchema,
  password: z.string().min(8, 'Mínimo 8 caracteres').max(200),
  rememberMe: z.boolean().default(false),
  subdominio: SubdominioSchema.optional(),
});
/** Tipo de ENTRADA del login (rememberMe es opcional: el server lo defaultea). */
export type LoginRequest = z.input<typeof LoginRequestSchema>;

/**
 * Dominio de correo institucional del colegio (lo que va después de la @).
 * Único por colegio: es la llave para resolver el tenant en el login.
 */
export const DominioEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
    'Dominio de correo inválido',
  );
export type DominioEmail = z.infer<typeof DominioEmailSchema>;

/**
 * Extrae el dominio (después de la última @) de un correo ya normalizado.
 * Devuelve null si no hay @ o el dominio no tiene formato válido.
 * Lo usan la API (resolver el colegio) y la web (saber cuándo consultar).
 */
export function dominioDeEmail(email: string): string | null {
  const limpio = email.trim().toLowerCase();
  const posicion = limpio.lastIndexOf('@');
  if (posicion <= 0 || posicion === limpio.length - 1) return null;
  const dominio = limpio.slice(posicion + 1);
  return DominioEmailSchema.safeParse(dominio).success ? dominio : null;
}

/**
 * Paso 1 del login sin subdominio: solo el identificador, para resolver el
 * colegio por el dominio heredado (`admin@colegio.edu.co`).
 */
export const IdentificarColegioRequestSchema = z.object({
  usuario: UsuarioSchema,
});
export type IdentificarColegioRequest = z.infer<typeof IdentificarColegioRequestSchema>;

/**
 * Cambio de contraseña (primer login o reset por admin).
 * La política exige al menos una mayúscula, una minúscula y un dígito.
 */
export const CambioPasswordSchema = z
  .object({
    passwordActual: z.string().min(1).max(200).optional(),
    passwordNueva: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .max(200)
      .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
      .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
      .regex(/[0-9]/, 'Debe incluir al menos un número'),
  })
  .strict();
export type CambioPassword = z.infer<typeof CambioPasswordSchema>;

/** Datos del usuario del colegio expuestos a la sesión. */
export interface UsuarioSesion {
  id: string;
  usuario: string;
  nombres: string;
  apellidos: string;
  esAdmin: boolean;
  debeCambiarPassword: boolean;
}

/** Datos del colegio expuestos a la sesión. */
export interface ColegioSesion {
  id: string;
  nombre: string;
  codigoDane: string;
  primaryColor: string | null;
}

/** Respuesta del login exitoso (shape que devuelve la API). */
export interface LoginResponse {
  usuario: UsuarioSesion;
  colegio: ColegioSesion;
}

/**
 * Login del nivel PLATAFORMA (equipo SaaS) — sin subdominio de colegio.
 * `.strict()`: rechaza campos extra en el body.
 */
export const PlataformaLoginRequestSchema = z
  .object({
    email: z.string().email('Correo electrónico inválido').max(254),
    password: z.string().min(1).max(200),
  })
  .strict();
export type PlataformaLoginRequest = z.infer<typeof PlataformaLoginRequestSchema>;

/** Datos públicos del colegio para el branding del login (pre-sesión). */
export interface ContextoColegioPublico {
  nombre: string;
  codigoDane: string;
  logoUrl: string | null;
  primaryColor: string | null;
  municipio: string;
  departamento: string;
  estado: EstadoColegio;
}

/** Respuesta de GET /auth/me (sesión activa). Discriminada por `tipo`. */
export type MeResponse =
  | {
      tipo: 'colegio';
      usuario: UsuarioSesion;
      colegio: ColegioSesion;
      /** Códigos `modulo.accion` asignados (lista vacía si esAdmin). */
      permisos: string[];
      esAdmin: boolean;
    }
  | {
      tipo: 'plataforma';
      plataformaUsuario: {
        id: string;
        email: string;
        nombreCompleto: string;
        rol: RolPlataforma;
      };
    };

/** Respuesta del login del nivel plataforma (mismo patrón que el de colegio). */
export interface PlataformaLoginResponse {
  plataformaUsuario: {
    id: string;
    email: string;
    nombreCompleto: string;
    rol: RolPlataforma;
  };
}
