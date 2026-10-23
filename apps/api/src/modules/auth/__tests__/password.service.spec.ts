/**
 * Tests unitarios de PasswordService — bcrypt con el costo de producción
 * (12), por eso los timeouts son amplios; el e2e usa costo 4 para fixtures.
 */
import { describe, expect, it } from 'vitest';
import { PasswordService } from '../password.service';

describe('PasswordService', () => {
  const servicio = new PasswordService();

  it(
    'hashea con bcrypt y verifica correctamente (incluido el caso negativo)',
    async () => {
      const hash = await servicio.hash('ClaveSegura123');
      expect(hash.startsWith('$2b$')).toBe(true);
      expect(await servicio.verify('ClaveSegura123', hash)).toBe(true);
      expect(await servicio.verify('OtraClave999', hash)).toBe(false);
    },
    20000,
  );

  it(
    'dos hashes de la misma contraseña son distintos (salt aleatorio)',
    async () => {
      const h1 = await servicio.hash('ClaveSegura123');
      const h2 = await servicio.hash('ClaveSegura123');
      expect(h1).not.toBe(h2);
    },
    20000,
  );
});