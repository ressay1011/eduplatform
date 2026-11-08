/** Constantes del módulo de autenticación. */
import { hash } from 'bcrypt';
import { randomBytes } from 'node:crypto';

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

/**
 * Cierre por inactividad: 60 minutos sin ninguna petición. Se suma al tope
 * absoluto (`SESION_TTL_MS`), que NO se renueva al usar la app.
 *
 * Como `ultima_actividad_en` se refresca como mucho cada ACTIVIDAD_THROTTLE_MS,
 * el corte real cae entre 60 y 65 minutos. Sin esto, una sesión abierta en un
 * equipo compartido seguía viva hasta agotar las 12 horas.
 */
export const SESION_INACTIVIDAD_MS = 60 * 60 * 1000;

/** Costo bcrypt (AGENTS.md §1.5: rounds >= 10). */
export const BCRYPT_ROUNDS = 12;

/**
 * Hash señuelo (coste 12, generado al primer uso desde bytes aleatorios).
 * Se compara contra él cuando el correo no existe, para que el tiempo de
 * respuesta sea el mismo que con una cuenta real y no se puedan enumerar
 * usuarios por timing (S3 del informe).
 *
 * Se genera en memoria a propósito: un hash bcrypt literal en el código es un
 * secreto embebido (Sonar `secrets:S8215`) y además no aporta nada, porque el
 * señuelo solo tiene que costar lo mismo que un hash real.
 *
 * Asíncrono y con la promesa cacheada: `bcrypt.hash` corre en el pool de
 * hilos, así que no bloquea el event loop como hacía `hashSync` (≈250 ms con
 * coste 12 en el primer login de un correo inexistente), y dos peticiones
 * simultáneas esperan la misma generación. `AuthService.onModuleInit` la
 * arranca al levantar el servicio, así que cuando llega la primera petición
 * ya está lista.
 */
let cacheSenuelo: Promise<string> | null = null;

export function hashSenuelo(): Promise<string> {
  cacheSenuelo ??= hash(randomBytes(32).toString('base64'), BCRYPT_ROUNDS);
  return cacheSenuelo;
}
