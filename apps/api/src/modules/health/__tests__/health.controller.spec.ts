/**
 * Unitarios del calentamiento: el freno de 20 s es una defensa contra floods,
 * así que conviene que falle en un test y no en producción.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@eduplatform/database';
import { HealthController } from '../health.controller';

/** Doble mínimo del cliente: solo lo que usa el controlador. */
function nuevoControlador(execute: ReturnType<typeof vi.fn>) {
  return new HealthController({ execute } as unknown as Database);
}

describe('HealthController · calentamiento', () => {
  it('consulta la base una sola vez dentro de la ventana', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const controller = nuevoControlador(execute);

    await controller.calentar();
    await controller.calentar();
    await controller.calentar();

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('vuelve a consultar cuando la ventana expira', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const controller = nuevoControlador(execute);

    await controller.calentar();
    // Envejece la marca sin esperar 20 s reales.
    (controller as unknown as { ultimaComprobacion: number }).ultimaComprobacion = 0;
    await controller.calentar();

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('si la base falla responde 503 con mensaje neutro y no marca la ventana', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const controller = nuevoControlador(execute);

    await expect(controller.calentar()).rejects.toBeInstanceOf(ServiceUnavailableException);
    // Al no marcar la ventana, el siguiente intento vuelve a probar la base.
    await expect(controller.calentar()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
