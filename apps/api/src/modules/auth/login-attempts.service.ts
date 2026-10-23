/**
 * LoginAttemptsService — bloqueo temporal POR IDENTIFICADOR (correo).
 *
 * El bloqueo de `usuarios.intentos_fallidos` solo protege cuentas que existen:
 * un ataque de diccionario contra correos inexistentes nunca lo activaría.
 * Este servicio cuenta los fallos de CUALQUIER correo (exista o no) y lo
 * bloquea 15 minutos tras 5 intentos, devolviendo el mismo 423 que una cuenta
 * real bloqueada (no revela si el correo existe).
 *
 * Memoria del proceso: con varias instancias en Render cada una lleva su
 * cuenta (igual que el caché de contexto); si se escala, migrar a Redis.
 * El TTL de las entradas evita que correos aleatorios llenen la memoria.
 */
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BLOQUEO_MINUTOS, MAX_INTENTOS_FALLIDOS } from './auth.constants';

interface Entrada {
  fallos: number;
  /** Epoch ms hasta el que está bloqueado; null si aún no se bloqueó. */
  bloqueadoHasta: number | null;
  /** Epoch ms del último fallo (para purgar entradas viejas). */
  ultimoFallo: number;
}

@Injectable()
export class LoginAttemptsService {
  /** Una entrada sin fallos nuevos en 60 min deja de ser relevante. */
  private static readonly TTL_MS = 60 * 60 * 1000;
  /** Tope duro: si el mapa crece demasiado, se purgan las entradas vencidas. */
  private static readonly MAX_ENTRADAS = 10_000;

  private readonly intentos = new Map<string, Entrada>();

  /** ¿Este correo está temporalmente bloqueado por fallos recientes? */
  estaBloqueado(email: string): boolean {
    const clave = this.clave(email);
    const entrada = this.intentos.get(clave);
    if (entrada === undefined) return false;
    if (entrada.bloqueadoHasta !== null && entrada.bloqueadoHasta > Date.now()) {
      return true;
    }
    // Bloqueo vencido (o entrada vieja): se descarta y se vuelve a contar.
    if (
      entrada.bloqueadoHasta !== null ||
      Date.now() - entrada.ultimoFallo > LoginAttemptsService.TTL_MS
    ) {
      this.intentos.delete(clave);
    }
    return false;
  }

  /** Registra un intento fallido; al llegar al máximo, bloquea el correo. */
  registrarFallo(email: string): void {
    this.purgarSiHaceFalta();
    const clave = this.clave(email);
    const ahora = Date.now();
    const entrada = this.intentos.get(clave);

    if (entrada === undefined) {
      this.intentos.set(clave, { fallos: 1, bloqueadoHasta: null, ultimoFallo: ahora });
      return;
    }

    entrada.fallos += 1;
    entrada.ultimoFallo = ahora;
    if (entrada.fallos >= MAX_INTENTOS_FALLIDOS) {
      entrada.bloqueadoHasta = ahora + BLOQUEO_MINUTOS * 60_000;
    }
    this.intentos.set(clave, entrada);
  }

  /** Login correcto: el correo sale del estado de fallos. */
  limpiar(email: string): void {
    this.intentos.delete(this.clave(email));
  }

  /** Limpia todo (tests / operaciones administrativas). */
  limpiarTodo(): void {
    this.intentos.clear();
  }

  /**
   * Clave del mapa: hash del correo normalizado. Guardar el hash (y no el
   * correo crudo) evita dejar PII en memoria y mantiene las claves cortas.
   */
  private clave(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  /** Poda entradas vencidas cuando el mapa supera el tope. */
  private purgarSiHaceFalta(): void {
    if (this.intentos.size < LoginAttemptsService.MAX_ENTRADAS) return;
    const limite = Date.now() - LoginAttemptsService.TTL_MS;
    for (const [clave, entrada] of this.intentos) {
      const bloqueoVencido =
        entrada.bloqueadoHasta === null || entrada.bloqueadoHasta <= Date.now();
      if (entrada.ultimoFallo < limite && bloqueoVencido) {
        this.intentos.delete(clave);
      }
    }
  }
}
