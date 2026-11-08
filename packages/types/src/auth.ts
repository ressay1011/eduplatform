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
  // Zod 4 deprecó `z.string().email()`: el formato vive en `z.email()` y el
  // recorte previo se conserva con `pipe`.
  .pipe(z.email('Correo electrónico inválido').max(254));

/**
 * Request del login multipasos (paso 2).
 * El colegio ya se resolvió en el paso 1 a partir del dominio del correo.
 */
/**
 * Código del colegio: su identificador estable, el que va en el usuario
 * (`admin@juanaArias` → `juanaArias`). Lo crea el administrador de plataforma y
 * nunca se edita.
 *
 * Formato: letras en cualquier caja, números y guiones; 3–32 caracteres; no
 * empieza ni termina en guion. Se guarda tal cual se escribió y se compara sin
 * caja (`juanaArias` y `juanaarias` son el mismo colegio).
 */
export const CodigoColegioSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{1,30}[A-Za-z0-9])$/,
    'Usa letras, números y guiones (3–32 caracteres, sin empezar/terminar en guion)',
  );
export type CodigoColegio = z.infer<typeof CodigoColegioSchema>;

/**
 * Nombre de usuario: el identificador de acceso del personal del colegio.
 *
 * NO es un correo. El colegio se resuelve por el código que va después de la
 * última `@` (`admin@juanaArias`), así que el identificador solo tiene que ser
 * único dentro del colegio; se admiten letras en cualquier caja, números, punto,
 * guion, guion bajo y `@`.
 *
 * Se guarda tal cual se escribió y se compara sin caja: `Admin@JuanaArias` y
 * `admin@juanaarias` son la misma cuenta.
 */
export const UsuarioSchema = z
  .string()
  .trim()
  .min(3, 'Mínimo 3 caracteres')
  .max(64, 'Máximo 64 caracteres')
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9._@-]*[A-Za-z0-9])$/,
    'Solo letras, números, puntos, guiones y @',
  );

/**
 * El sufijo del nombre de usuario vive en `codigo.ts` (sin zod) y se reexporta
 * aquí para no romper a los consumidores que ya lo importaban de `auth`.
 */
export { sufijoDeUsuario } from './codigo';

/**
 * Login de usuario de colegio.
 *
 * El colegio sale del **código** que lleva el identificador (`admin@juanaArias`).
 * `codigo` es la pista del enlace (`?codigo=`) y solo se usa cuando el
 * identificador no trae sufijo.
 */
export const LoginRequestSchema = z.object({
  usuario: UsuarioSchema,
  password: z.string().min(8, 'Mínimo 8 caracteres').max(200),
  rememberMe: z.boolean().default(false),
  /** Pista del enlace (`?codigo=`): se usa si el identificador no trae sufijo. */
  codigo: CodigoColegioSchema.optional(),
});
/** Tipo de ENTRADA del login (rememberMe es opcional: el server lo defaultea). */
export type LoginRequest = z.input<typeof LoginRequestSchema>;

/**
 * Dominio de correo institucional del colegio (lo que va después de la @).
 * Único por colegio: es la llave para resolver el tenant en el login.
 */

/**
 * Paso 1 del login sin pista: solo el identificador, para resolver el
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
 * Login del nivel PLATAFORMA (equipo SaaS) — sin colegio.
 * `.strict()`: rechaza campos extra en el body.
 */
export const PlataformaLoginRequestSchema = z
  .object({
    email: z.email('Correo electrónico inválido').max(254),
    password: z.string().min(1).max(200),
  })
  .strict();
export type PlataformaLoginRequest = z.infer<typeof PlataformaLoginRequestSchema>;

/** Datos públicos del colegio para el branding del login (pre-sesión). */
export interface ContextoColegioPublico {
  /** Código estable del colegio: es lo que resuelve el login. */
  codigo: string;
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
