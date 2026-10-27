/**
 * Validación de variables de entorno al boot (Zod — AGENTS.md §2.2).
 * Carga `.env` en desarrollo (dotenv; en prod las vars vienen del entorno).
 * Si falta o es inválida una variable requerida, la API NO arranca (fail fast).
 */
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    /** Orígenes del frontend separados por coma. */
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    /** Rol de runtime SIEMPRE app_user (sujeto a RLS). Obligatoria en producción. */
    DATABASE_URL: z.string().url().optional(),
    /** Pepper de tokens de sesión (sha256(token + pepper)). */
    TOKEN_PEPPER: z.string().min(16, 'TOKEN_PEPPER debe tener al menos 16 caracteres'),
    /** Rate limiting global: requests por ventana de 60s, por IP. */
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
    /** Rate limiting estricto de /auth/login (por IP y ventana de 60s). */
    THROTTLE_LOGIN_LIMIT: z.coerce.number().int().positive().default(10),
    /**
     * SameSite de la cookie de sesión. `lax` funciona cuando web y API comparten
     * dominio registrable (app./api.eduplatform.co). Con Vercel + Render en
     * dominios distintos hay que poner `none` (y `secure`, que ya es
     * obligatorio fuera de development) o la cookie no viaja y el login falla.
     */
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    /**
     * App token de datos.gov.co (Socrata) para la consulta por código DANE.
     * Opcional: sin él la petición sale del pool por IP (sin cupo propio); con
     * él, 1.000 peticiones/hora. No es una credencial de datos —los datasets
     * son abiertos— pero se mantiene en el entorno y no en el código.
     */
    DATOS_GOV_APP_TOKEN: z.preprocess(
      // Una variable vacía en el `.env` (plantilla copiada sin rellenar) no debe
      // tumbar el arranque: se trata como ausente.
      (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
      z.string().trim().min(10).optional(),
    ),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production' && val.DATABASE_URL === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL es obligatoria en producción',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Variables de entorno validadas. Importar SIEMPRE desde aquí, no `process.env`. */
export const env: Env = EnvSchema.parse(process.env);
