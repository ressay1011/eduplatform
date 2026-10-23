/**
 * E2E del health check: LEVANTA la app Nest real (con la misma configuración
 * que main.ts, vía configureApp) y hace peticiones HTTP con supertest.
 * Requiere la base de datos corriendo SOLO si un endpoint la consulta —
 * este test no toca la BD (pool de postgres.js es lazy).
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApp } from '../../../app.setup';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde 200 con el contrato ApiResponse', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok', servicio: 'eduplatform-api' },
    });
  });

  it('una ruta inexistente responde 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/no-existe');
    expect(res.status).toBe(404);
  });
});