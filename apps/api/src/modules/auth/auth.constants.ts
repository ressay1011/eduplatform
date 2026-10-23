/** Constantes del módulo de autenticación. */

/** Nombre de la cookie httpOnly que transporta la sesión. */
export const SESION_COOKIE = 'eduplatform_sesion';

/** 12 horas de sesión normal; 30 días con "recordarme". */
export const SESION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESION_TTL_RECORDAR_MS = 30 * 24 * 60 * 60 * 1000;

/** Fuerza bruta: intentos fallidos antes del bloqueo temporal (y su duración). */
export const MAX_INTENTOS_FALLIDOS = 5;
export const BLOQUEO_MINUTOS = 15;

/** Throttle de `sesiones.ultima_actividad_en` (evita un UPDATE por request). */
export const ACTIVIDAD_THROTTLE_MS = 5 * 60 * 1000;

/** Costo bcrypt (AGENTS.md §1.5: rounds >= 10). */
export const BCRYPT_ROUNDS = 12;

/**
 * Hash señuelo (coste 12, de una contraseña aleatoria ya descartada).
 * Se compara contra él cuando el correo no existe, para que el tiempo de
 * respuesta sea el mismo que con una cuenta real y no se puedan enumerar
 * usuarios por timing (S3 del informe).
 */
export const HASH_SENUELO = '$2b$12$WkFfutUPIr6AOpFkO1b/9eDkNTdKe6nMn/t2tRo8.bBmYFhBiS.uq';
