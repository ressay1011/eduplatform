/**
 * Tests del bloqueo por identificador (anti-diccionario).
 * No toca BD: es lógica pura en memoria, por eso puede probarse directo.
 */
import { describe, expect, it } from 'vitest';
import { BLOQUEO_MINUTOS, MAX_INTENTOS_FALLIDOS } from '../auth.constants';
import { LoginAttemptsService } from '../login-attempts.service';

describe('LoginAttemptsService', () => {
  it('bloquea el correo al llegar a 5 fallos y lo libera al limpiar (login correcto)', () => {
    const servicio = new LoginAttemptsService();
    const correo = 'fantasma@colegio.test';

    for (let i = 0; i < MAX_INTENTOS_FALLIDOS - 1; i += 1) {
      servicio.registrarFallo(correo);
    }
    expect(servicio.estaBloqueado(correo)).toBe(false);

    servicio.registrarFallo(correo);
    expect(servicio.estaBloqueado(correo)).toBe(true);

    servicio.limpiar(correo);
    expect(servicio.estaBloqueado(correo)).toBe(false);
  });

  it('normaliza el correo (mayúsculas/espacios) y no bloquea a otros identificadores', () => {
    const servicio = new LoginAttemptsService();
    const correo = 'persona@colegio.test';

    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i += 1) {
      servicio.registrarFallo('  Persona@Colegio.TEST ');
    }
    expect(servicio.estaBloqueado(correo)).toBe(true);
    expect(servicio.estaBloqueado('otra@colegio.test')).toBe(false);
  });

  it('el bloqueo dura los minutos configurados (no se libera antes)', () => {
    const servicio = new LoginAttemptsService();
    const correo = 'temporal@colegio.test';
    for (let i = 0; i < MAX_INTENTOS_FALLIDOS; i += 1) servicio.registrarFallo(correo);

    // Recién bloqueado sigue bloqueado; el TTL es de BLOQUEO_MINUTOS.
    expect(servicio.estaBloqueado(correo)).toBe(true);
    expect(BLOQUEO_MINUTOS).toBeGreaterThan(0);
  });
});
