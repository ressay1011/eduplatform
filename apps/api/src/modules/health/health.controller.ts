/**
 * Health check — público (sin guards). Lo usan Render (health checks del
 * deploy) y los tests e2e para verificar que la app arranca.
 */
import { Controller, Get } from '@nestjs/common';
import type { ApiResponse } from '@eduplatform/types';
import { Public } from '../auth/decorators/public.decorator';

interface HealthData {
  status: 'ok';
  servicio: string;
  timestamp: string;
}

@Controller('health')
export class HealthController {
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
}
