/**
 * E2E del módulo de autenticación — corre contra la BASE DE DATOS REAL
 * (docker compose) porque el valor de este módulo es el ciclo completo:
 * cookie httpOnly → sesión en BD → contexto → guards de permisos (ADR-003).
 *
 * Fixtures: se crean y se limpian en este mismo spec. Los passwordHash usan
 * bcrypt costo 4 (solo los round-trips de producción necesitan el 12).
 */
import { randomInt } from 'node:crypto';
import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  auditLog,
  colegios,
  permisos,
  sesiones,
  usuarios,
  usuariosPermisos,
  withTenant,
  type Database,
  type TenantContext,
} from '@eduplatform/database';
import { AppModule } from '../../../app.module';
import { configureApp } from '../../../app.setup';
import { DATABASE } from '../../../shared/database.module';
import { SIN_COLEGIO_ID } from '../../../shared/platform-context';
import { AuthService } from '../auth.service';
import { RequirePermission } from '../decorators/require-permission.decorator';

/** Endpoint SOLO para este spec: ejercita el PermissionsGuard (ADR-003). */
@Controller('test-guard')
class TestGuardController {
  @RequirePermission('auditoria.ver')
  @Get('protegido')
  protegido(): { ok: boolean } {
    return { ok: true };
  }
}

const platformCtx: TenantContext = { colegioId: SIN_COLEGIO_ID, isPlatformAdmin: true };

const PASSWORD_ADMIN = 'AdminSegura123';
const PASSWORD_STAFF = 'StaffSegura123';
const PASSWORD_NUEVA = 'NuevaSegura456';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  // Sufijo aleatorio: varios specs corren en hilos en paralelo y con
  // `Date.now()` compartían milisegundo (choque de codigo_dane/codigo).
  const sufijo = String(randomInt(0, 100_000_000)).padStart(8, '0');
  const codigoA = `e2e-a-${sufijo}`;
  const codigoB = `e2e-b-${sufijo}`;
  // Dominios de correo: son la llave del login unificado (únicos por colegio).
  const emailAdminA = `admin-a@${codigoA}`;
  const emailStaffA = `staff-a@${codigoA}`;
  const emailAdminB = `user-b@${codigoB}`;
  // Usuario con forma de correo: entra porque lleva el código del colegio al final.
  const emailGmailA = `rector.juanaarias.${sufijo}@gmail.com@${codigoA}`;
  // Usuario cuyo sufijo ES el código: resuelve el colegio sin pista.
  const usuarioSufijoA = `rector@${codigoA}`;
  let colegioAId = '';
  let colegioBId = '';
  let adminId = '';
  let staffId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestGuardController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = moduleRef.get<Database>(DATABASE);

    const hashCostoBajo = await bcrypt.hash(PASSWORD_ADMIN, 4);
    const hashStaff = await bcrypt.hash(PASSWORD_STAFF, 4);

    await withTenant(db, platformCtx, async (tx) => {
      const colegiosCreados = await tx
        .insert(colegios)
        .values([
          {
            nombre: 'Colegio E2E A',
            codigoDane: `1${sufijo}000`,
            codigo: codigoA,
            municipio: 'Plato',
            departamento: 'Magdalena',
            email: 'a@e2e.co',
            calendario: 'A',
          },
          {
            nombre: 'Colegio E2E B',
            codigoDane: `2${sufijo}000`,
            codigo: codigoB,
            municipio: 'Plato',
            departamento: 'Magdalena',
            email: 'b@e2e.co',
            calendario: 'A',
          },
        ])
        .returning({ id: colegios.id });
      const [cA, cB] = colegiosCreados;
      if (cA === undefined || cB === undefined) throw new Error('Fixtures: colegios no creados');
      colegioAId = cA.id;
      colegioBId = cB.id;

      const usuariosCreados = await tx
        .insert(usuarios)
        .values([
          {
            colegioId: colegioAId,
            usuario: emailAdminA,
            passwordHash: hashCostoBajo,
            nombres: 'Admin',
            apellidos: 'A',
            tipoDocumento: 'CC',
            numeroDocumento: `71${sufijo}1`,
            esAdmin: true,
            debeCambiarPassword: false,
          },
          {
            colegioId: colegioAId,
            usuario: emailStaffA,
            passwordHash: hashStaff,
            nombres: 'Staff',
            apellidos: 'A',
            tipoDocumento: 'CC',
            numeroDocumento: `72${sufijo}1`,
            // Cada test que dependa de este flag lo fija al empezar: aquí
            // conviven el primer ingreso (true) y el uso normal (false).
            debeCambiarPassword: true,
          },
          {
            colegioId: colegioAId,
            usuario: usuarioSufijoA,
            passwordHash: hashCostoBajo,
            nombres: 'Rector',
            apellidos: 'Sufijo',
            tipoDocumento: 'CC',
            numeroDocumento: `75${sufijo}1`,
            esAdmin: false,
            debeCambiarPassword: false,
          },
          {
            colegioId: colegioAId,
            usuario: emailGmailA,
            passwordHash: hashStaff,
            nombres: 'Rector',
            apellidos: 'Gmail',
            tipoDocumento: 'CC',
            numeroDocumento: `74${sufijo}1`,
            esAdmin: false,
            debeCambiarPassword: false,
          },
          {
            colegioId: colegioBId,
            usuario: emailAdminB,
            passwordHash: hashCostoBajo,
            nombres: 'User',
            apellidos: 'B',
            tipoDocumento: 'CC',
            numeroDocumento: `73${sufijo}1`,
            esAdmin: true,
            debeCambiarPassword: false,
          },
        ])
        .returning({ id: usuarios.id });
      const [uAdmin, uStaff] = usuariosCreados;
      if (uAdmin === undefined || uStaff === undefined) {
        throw new Error('Fixtures: usuarios no creados');
      }
      adminId = uAdmin.id;
      staffId = uStaff.id;
    });
  }, 30000);

  afterAll(async () => {
    // Sin fixtures creados no hay nada que borrar (evita uuid '' en los deletes).
    if (colegioAId !== '') {
      await withTenant(db, platformCtx, async (tx) => {
        // Borrado en orden por dependencias de FK (y sin depender de cascadas).
        await tx.delete(auditLog).where(eq(auditLog.colegioId, colegioAId));
        await tx.delete(auditLog).where(eq(auditLog.colegioId, colegioBId));
        await tx.delete(sesiones).where(eq(sesiones.colegioId, colegioAId));
        await tx.delete(sesiones).where(eq(sesiones.colegioId, colegioBId));
        await tx.delete(usuariosPermisos).where(eq(usuariosPermisos.colegioId, colegioAId));
        await tx.delete(usuariosPermisos).where(eq(usuariosPermisos.colegioId, colegioBId));
        await tx.delete(usuarios).where(eq(usuarios.colegioId, colegioAId));
        await tx.delete(usuarios).where(eq(usuarios.colegioId, colegioBId));
        await tx.delete(colegios).where(eq(colegios.id, colegioAId));
        await tx.delete(colegios).where(eq(colegios.id, colegioBId));
      });
    }
    await app.close();
  }, 30000);

  it('contexto-colegio devuelve el branding público del colegio', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/auth/contexto-colegio?codigo=${codigoA}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        codigo: codigoA,
        nombre: 'Colegio E2E A',
        codigoDane: `1${sufijo}000`,
        estado: 'PRUEBA',
      },
    });
  });

  it('el login no distingue la caja del identificador', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: `Admin-A@${codigoA.toUpperCase()}`, password: PASSWORD_ADMIN })
      .expect(200);

    expect(body.data.usuario.usuario).toBe(emailAdminA);
  });

  it('contexto-colegio con codigo inexistente → 404 con el contrato', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/auth/contexto-colegio?codigo=no-existe-xyz',
    );
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('un usuario con forma de correo entra si lleva el código al final', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailGmailA, password: PASSWORD_STAFF })
      .expect(200);

    expect(body.data.usuario.usuario).toBe(emailGmailA);
    expect(body.data.colegio.id).toBe(colegioAId);
  });

  it('el colegio sale del código del usuario (admin@codigo)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: usuarioSufijoA, password: PASSWORD_ADMIN })
      .expect(200);

    expect(body.data.colegio.id).toBe(colegioAId);
    expect(body.data.usuario.usuario).toBe(usuarioSufijoA);
  });

  it('un sufijo que no es el código de ningún colegio → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: `rector@dominio-inexistente.test`, password: PASSWORD_STAFF })
      .expect(401);
  });

  it('login con un dominio de correo desconocido → 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: 'alguien@dominio-inexistente.test', password: PASSWORD_ADMIN });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('anti-diccionario: 5 fallos con un correo INEXISTENTE bloquean el identificador (423)', async () => {
    // Correo con dominio válido pero usuario que no existe en la BD: antes
    // solo lo frenaba el rate limit por IP; ahora se bloquea el identificador.
    const correoFantasma = `fantasma-${sufijo}@${codigoA}`;

    for (let i = 0; i < 5; i += 1) {
      const intento = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usuario: correoFantasma, password: 'Incorrecta999' });
      expect(intento.status).toBe(401);
    }

    const bloqueado = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: correoFantasma, password: 'Incorrecta999' });
    expect(bloqueado.status).toBe(423);
    expect(bloqueado.body).toMatchObject({ success: false, error: { code: 'ACCOUNT_LOCKED' } });
  });

  it('anti-diccionario: un dominio inexistente también se bloquea tras 5 fallos', async () => {
    const correo = `nadie-${sufijo}@dominio-fantasma.test`;

    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usuario: correo, password: 'Incorrecta999' })
        .expect(401);
    }
    const bloqueado = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: correo, password: 'Incorrecta999' });
    expect(bloqueado.status).toBe(423);
  });

  it('login con contraseña incorrecta → 401 y suma intento fallido', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: 'Incorrecta999' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    const filas = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ intentos: usuarios.intentosFallidos })
        .from(usuarios)
        .where(eq(usuarios.id, adminId)),
    );
    expect(filas[0]?.intentos).toBe(1);
  });

  it('login correcto → 200, cookie httpOnly y reset de intentos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: PASSWORD_ADMIN });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        usuario: { usuario: emailAdminA, esAdmin: true },
        colegio: { nombre: 'Colegio E2E A' },
      },
    });
    const setCookie: unknown = res.headers['set-cookie'];
    if (!Array.isArray(setCookie)) throw new Error('La respuesta no trae Set-Cookie');
    const cookie = setCookie.map(String).join(';');
    expect(cookie).toContain('eduplatform_sesion=');
    expect(cookie.toLowerCase()).toContain('httponly');
    const filas = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ intentos: usuarios.intentosFallidos })
        .from(usuarios)
        .where(eq(usuarios.id, adminId)),
    );
    expect(filas[0]?.intentos).toBe(0);
  });

  it('tras vencer el bloqueo, un fallo NO vuelve a bloquear (cuenta recuperable)', async () => {
    // Estado exacto de una cuenta a la que se le pasaron los 15 minutos:
    // contador en el máximo y el bloqueo ya en el pasado.
    await withTenant(db, platformCtx, (tx) =>
      tx
        .update(usuarios)
        .set({ intentosFallidos: 5, bloqueadoHasta: new Date(Date.now() - 60_000) })
        .where(eq(usuarios.id, adminId)),
    );

    const fallo = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: 'Incorrecta999' });
    expect(fallo.status).toBe(401);

    // Un solo fallo cuenta como el PRIMERO de la ventana nueva, no como el sexto.
    const trasFallo = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ intentos: usuarios.intentosFallidos, bloqueo: usuarios.bloqueadoHasta })
        .from(usuarios)
        .where(eq(usuarios.id, adminId)),
    );
    expect(trasFallo[0]?.intentos).toBe(1);
    expect(trasFallo[0]?.bloqueo).toBeNull();

    // Y el dueño de la cuenta puede entrar con su contraseña correcta.
    const ok = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: PASSWORD_ADMIN });
    expect(ok.status).toBe(200);
  });

  it('sesión con 59 minutos de inactividad sigue válida', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: PASSWORD_ADMIN });
    const cookie = (login.headers['set-cookie'] as unknown as string[]).map(String).join('; ');
    await withTenant(db, platformCtx, (tx) =>
      tx
        .update(sesiones)
        .set({ ultimaActividadEn: new Date(Date.now() - 59 * 60_000) })
        .where(eq(sesiones.usuarioId, adminId)),
    );
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
  });

  it('sesión inactiva más de 60 min → 401 y queda revocada en BD', async () => {
    // Cuenta de sesiones revocadas de este usuario (antes/después): hay
    // sesiones antiguas que ya lo estaban.
    const revocadas = async (): Promise<number> =>
      (
        await withTenant(db, platformCtx, (tx) =>
          tx
            .select({ revocada: sesiones.revocadaEn })
            .from(sesiones)
            .where(eq(sesiones.usuarioId, adminId)),
        )
      ).filter((f) => f.revocada !== null).length;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: PASSWORD_ADMIN });
    const cookie = (login.headers['set-cookie'] as unknown as string[]).map(String).join('; ');
    await withTenant(db, platformCtx, (tx) =>
      tx
        .update(sesiones)
        .set({ ultimaActividadEn: new Date(Date.now() - 61 * 60_000) })
        .where(eq(sesiones.usuarioId, adminId)),
    );

    const antes = await revocadas();
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('UNAUTHORIZED');
    expect(await revocadas()).toBe(antes + 1);
  });

  it('contraseña inicial sin cambiar → 403 fuera de las rutas permitidas', async () => {
    await withTenant(db, platformCtx, (tx) =>
      tx.update(usuarios).set({ debeCambiarPassword: true }).where(eq(usuarios.id, adminId)),
    );
    try {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usuario: emailAdminA, password: PASSWORD_ADMIN });
      expect(login.status).toBe(200);
      expect(login.body.data.usuario.debeCambiarPassword).toBe(true);
      const cookie = (login.headers['set-cookie'] as unknown as string[]).map(String).join('; ');

      // Las tres rutas que sí puede usar.
      const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(200);

      // Cualquier otra, no.
      const protegido = await request(app.getHttpServer())
        .get('/api/test-guard/protegido')
        .set('Cookie', cookie);
      expect(protegido.status).toBe(403);
      expect(protegido.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    } finally {
      await withTenant(db, platformCtx, (tx) =>
        tx.update(usuarios).set({ debeCambiarPassword: false }).where(eq(usuarios.id, adminId)),
      );
    }
  });

  it('login de usuario inexistente → 401 con mensaje genérico', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: 'nadie@e2e.co', password: 'Cualquiera123' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Usuario o contraseña incorrectos');
  });

  it('me sin cookie → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('flujo admin: login → me → endpoint protegido (es_admin pasa siempre)', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: PASSWORD_ADMIN })
      .expect(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      success: true,
      data: {
        tipo: 'colegio',
        esAdmin: true,
        permisos: [],
        usuario: { usuario: emailAdminA },
        colegio: { nombre: 'Colegio E2E A' },
      },
    });

    const protegido = await agent.get('/api/test-guard/protegido');
    expect(protegido.status).toBe(200);
  });

  it('staff sin permiso → 403 + audit; con permiso asignado → 200', async () => {
    // Ya cambió su contraseña inicial: esta prueba es de permisos.
    await withTenant(db, platformCtx, (tx) =>
      tx.update(usuarios).set({ debeCambiarPassword: false }).where(eq(usuarios.id, staffId)),
    );
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ usuario: emailStaffA, password: PASSWORD_STAFF })
      .expect(200);

    const denegado = await agent.get('/api/test-guard/protegido');
    expect(denegado.status).toBe(403);
    expect(denegado.body.error.code).toBe('FORBIDDEN');

    const auditoria = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(and(eq(auditLog.colegioId, colegioAId), eq(auditLog.accion, 'PERMISSION_DENIED'))),
    );
    expect(auditoria.length).toBeGreaterThanOrEqual(1);

    // El admin le asigna `auditoria.ver` y el guard lo respeta en el siguiente request.
    await withTenant(db, platformCtx, async (tx) => {
      const catalogo = await tx
        .select({ id: permisos.id })
        .from(permisos)
        .where(eq(permisos.codigo, 'auditoria.ver'))
        .limit(1);
      const permiso = catalogo[0];
      if (permiso === undefined) throw new Error('El catálogo no tiene auditoria.ver');
      await tx.insert(usuariosPermisos).values({
        colegioId: colegioAId,
        usuarioId: staffId,
        permisoId: permiso.id,
        asignadoPorId: adminId,
      });
    });

    const permitido = await agent.get('/api/test-guard/protegido');
    expect(permitido.status).toBe(200);
  });

  it('cambio de contraseña (primer login): sin actual, y revoca las demás sesiones', async () => {
    // Primer ingreso: contraseña inicial sin cambiar (la que puso el admin).
    await withTenant(db, platformCtx, (tx) =>
      tx.update(usuarios).set({ debeCambiarPassword: true }).where(eq(usuarios.id, staffId)),
    );
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ usuario: emailStaffA, password: PASSWORD_STAFF })
      .expect(200);
    const agent2 = request.agent(app.getHttpServer());
    await agent2
      .post('/api/auth/login')
      .send({ usuario: emailStaffA, password: PASSWORD_STAFF })
      .expect(200);

    const cambio = await agent
      .post('/api/auth/cambiar-password')
      .send({ passwordNueva: PASSWORD_NUEVA });
    expect(cambio.status).toBe(200);

    // La sesión que hizo el cambio sigue viva; la otra quedó revocada.
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent2.get('/api/auth/me')).status).toBe(401);

    // La contraseña vieja ya no sirve; la nueva sí (y limpia el flag).
    const viejo = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailStaffA, password: PASSWORD_STAFF });
    expect(viejo.status).toBe(401);

    const nuevo = await request
      .agent(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: emailStaffA, password: PASSWORD_NUEVA });
    expect(nuevo.status).toBe(200);
    expect(nuevo.body.data.usuario.debeCambiarPassword).toBe(false);
  });

  it('cambio de contraseña sin actual (cuando NO es primer login) → 400', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: PASSWORD_ADMIN })
      .expect(200);
    const res = await agent
      .post('/api/auth/cambiar-password')
      .send({ passwordNueva: PASSWORD_NUEVA });
    expect(res.status).toBe(400);
  });

  it('logout revoca la sesión y limpia la cookie', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ usuario: emailAdminA, password: PASSWORD_ADMIN })
      .expect(200);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('aislamiento cross-tenant: la sesión de B no opera con reglas de A (y RLS en BD)', async () => {
    const agentB = request.agent(app.getHttpServer());
    const loginB = await agentB
      .post('/api/auth/login')
      .send({ usuario: emailAdminB, password: PASSWORD_ADMIN });
    expect(loginB.status).toBe(200);

    const meB = await agentB.get('/api/auth/me');
    expect(meB.body.data.colegio.nombre).toBe('Colegio E2E B');

    // El tenant sale de la sesión: la sesión de B nunca ve datos de A.
    // RLS de verdad: con el contexto de A, la BD solo devuelve usuarios de A.
    const filas = await withTenant(db, { colegioId: colegioAId, isPlatformAdmin: false }, (tx) =>
      tx.select({ id: usuarios.id }).from(usuarios),
    );
    expect(filas).toHaveLength(4);
    const idsVisibles = filas.map((f) => f.id);
    expect(idsVisibles).toContain(adminId);
    expect(idsVisibles).toContain(staffId);
  });

  it('contexto-colegio: ETag/304 y la invalidación refleja el cambio de color al instante', async () => {
    // 1) Primera carga: 200 + ETag + no-cache (el navegador siempre revalida).
    const primera = await request(app.getHttpServer()).get(
      `/api/auth/contexto-colegio?codigo=${codigoA}`,
    );
    expect(primera.status).toBe(200);
    const etag = primera.headers['etag'];
    expect(typeof etag).toBe('string');
    expect(String(primera.headers['cache-control'])).toContain('no-cache');

    // 2) Con If-None-Match: 304 sin cuerpo (sin tráfico de más).
    const revalidacion = await request(app.getHttpServer())
      .get(`/api/auth/contexto-colegio?codigo=${codigoA}`)
      .set('If-None-Match', String(etag));
    expect(revalidacion.status).toBe(304);

    // 3) Cambia el color en BD: la caché todavía sirve el valor anterior…
    await withTenant(db, platformCtx, (tx) =>
      tx.update(colegios).set({ primaryColor: '#a3331a' }).where(eq(colegios.id, colegioAId)),
    );
    const antesDeInvalidar = await request(app.getHttpServer()).get(
      `/api/auth/contexto-colegio?codigo=${codigoA}`,
    );
    expect(antesDeInvalidar.body.data.primaryColor).toBeNull();

    // 4) …y al invalidar (lo hará el módulo de colegios al editar), el nuevo
    //    valor sale YA — sin esperar ventanas de 60s ni TTL.
    //    Se invalida por la MISMA vía que usará el módulo de colegios.
    app.get(AuthService).invalidarContextoColegio({ codigo: codigoA });
    const despues = await request(app.getHttpServer()).get(
      `/api/auth/contexto-colegio?codigo=${codigoA}`,
    );
    expect(despues.body.data.primaryColor).toBe('#a3331a');
    expect(despues.headers['etag']).not.toBe(etag);
  });
});
