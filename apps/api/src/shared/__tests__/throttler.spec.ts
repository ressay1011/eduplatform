/**
 * Test aislado del rate limiting (@nestjs/throttler): módulo propio con un
 * límite diminuto para provocar el 429 sin afectar los e2e generales.
 */
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiExceptionFilter } from '../api-exception.filter';

/** Endpoint mínimo para contar requests. */
@Controller('limitado')
class LimitadoController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

describe('Rate limiting (throttler)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
      controllers: [LimitadoController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('la 3ª request dentro de la ventana responde 429 con el contrato', async () => {
    const servidor = app.getHttpServer();
    expect((await request(servidor).get('/limitado')).status).toBe(200);
    expect((await request(servidor).get('/limitado')).status).toBe(200);

    const tercera = await request(servidor).get('/limitado');
    expect(tercera.status).toBe(429);
    expect(tercera.body).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    });
  });
});
