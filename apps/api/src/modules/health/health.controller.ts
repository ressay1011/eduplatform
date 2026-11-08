/**
 * Health check — público (sin guards). Lo usan Render (health checks del
 * deploy), los tests e2e y el monitor de disponibilidad.
 *
 * `GET /api/health` es a propósito **estático**: no toca la base, así el health
 * check de Render no despierta Neon en cada deploy y responde incluso con la
 * base caída (distingue «la API no arrancó» de «la base no responde»).
 *
 * `GET /api/health/calentamiento` sí consulta la base (`SELECT 1`): existe para
 * que un ping programado despierte a la vez el proceso de Render y el compute de
 * Neon, que escalan a cero por separado. No devuelve datos ni pide sesión, y el
 * throttle global (100 req/min por IP) lo protege.
 */
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ApiResponse } from '@eduplatform/types';
import type { Database } from '@eduplatform/database';
import { DATABASE } from '../../shared/database.module';
import { Public } from '../auth/decorators/public.decorator';

interface HealthData {
  status: 'ok';
  servicio: string;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  /**
   * Última vez que se consultó la base por el calentamiento.
   *
   * El endpoint es público y cada `SELECT 1` ocupa una conexión del pool
   * (máximo 10) durante el viaje a Neon. Sin este freno, un flood —o un
   * `<img src>` incrustado en una página muy visitada, que aporta una IP por
   * visitante y esquiva el throttle— convertiría el calentamiento en un
   * generador de consultas. Con la ventana, la base recibe como mucho una cada
   * 20 s y el resto se responde de memoria.
   */
  private static readonly VENTANA_MS = 20_000;
  private ultimaComprobacion = 0;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Public()
  @Get()
  check(): ApiResponse<HealthData> {
    return {
      success: true,
      data: {
        status: 'ok',
        servicio: 'eduplatform-api',
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Public()
  @Get('calentamiento')
  async calentar(): Promise<ApiResponse<{ estado: 'caliente' }>> {
    if (Date.now() - this.ultimaComprobacion >= HealthController.VENTANA_MS) {
      try {
        await this.db.execute(sql`SELECT 1`);
      } catch {
        // 503 con mensaje neutro: dice «no está listo» sin contar si el que
        // falla es Postgres, la red o el pool.
        throw new ServiceUnavailableException('Servicio no disponible');
      }
      this.ultimaComprobacion = Date.now();
    }
    return { success: true, data: { estado: 'caliente' } };
  }
}
