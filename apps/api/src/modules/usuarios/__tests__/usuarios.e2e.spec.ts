/**
 * Usuarios (e2e) — BD real. Cubre:
 *  - aislamiento multi-tenant (RLS): nunca se ven usuarios de otro colegio
 *  - permisos granulares (usuarios.ver / crear / editar)
 *  - reglas: admin único, no auto-desactivarse, dominio institucional
 *  - contraseña temporal: se devuelve una vez, obliga cambio y revoca sesiones
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
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

const PASSWORD_ADMIN = 'AdminSegura123';
const PASSWORD_STAFF = 'StaffSegura123';

const platformCtx: TenantContext = { colegioId: SIN_COLEGIO_ID, isPlatformAdmin: true };

describe('Usuarios (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const sufijo = String(Date.now()).slice(-8);
  const subdominioA = `usr-a-${sufijo}`;
  const subdominioB = `usr-b-${sufijo}`;
  const dominioA = `ua-${sufijo}.test`;
  const dominioB = `ub-${sufijo}.test`;

  let colegioAId = '';
  let colegioBId = '';
  let adminAId = '';
  let adminEmail = '';
  let lectorEmail = '';
  let gestorEmail = '';
  let portalEmail = '';
  let adminBEmail = '';

  async function login(email: string, password: string) {
    const agente = request.agent(app.getHttpServer());
    await agente.post('/api/auth/login').send({ email, password }).expect(200);
    return agente;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = moduleRef.get<Database>(DATABASE);

    const hashAdmin = await bcrypt.hash(PASSWORD_ADMIN, 4);
    const hashStaff = await bcrypt.hash(PASSWORD_STAFF, 4);

    await withTenant(db, platformCtx, async (tx) => {
      const creados = await tx
        .insert(colegios)
        .values([
          {
            nombre: 'Colegio Usuarios A',
            codigoDane: `3${sufijo}000`,
            subdominio: subdominioA,
            dominioEmail: dominioA,
            municipio: 'Plato',
            departamento: 'Magdalena',
            email: `contacto@${dominioA}`,
            calendario: 'A',
            estado: 'ACTIVO',
          },
          {
            nombre: 'Colegio Usuarios B',
            codigoDane: `4${sufijo}000`,
            subdominio: subdominioB,
            dominioEmail: dominioB,
            municipio: 'Plato',
            departamento: 'Magdalena',
            email: `contacto@${dominioB}`,
            calendario: 'A',
            estado: 'ACTIVO',
          },
        ])
        .returning({ id: colegios.id });
      const [cA, cB] = creados;
      if (cA === undefined || cB === undefined) throw new Error('Fixtures: colegios');
      colegioAId = cA.id;
      colegioBId = cB.id;

      adminEmail = `admin@${dominioA}`;
      lectorEmail = `lector@${dominioA}`;
      gestorEmail = `gestor@${dominioA}`;
      portalEmail = `portal@${dominioA}`;
      adminBEmail = `admin@${dominioB}`;

      const creadosUsuarios = await tx
        .insert(usuarios)
        .values([
          {
            colegioId: colegioAId,
            email: adminEmail,
            passwordHash: hashAdmin,
            nombres: 'Admin',
            apellidos: 'A',
            tipoDocumento: 'CC',
            numeroDocumento: `81${sufijo}1`,
            esAdmin: true,
            debeCambiarPassword: false,
          },
          {
            colegioId: colegioAId,
            email: lectorEmail,
            passwordHash: hashStaff,
            nombres: 'Lector',
            apellidos: 'A',
            tipoDocumento: 'CC',
            numeroDocumento: `81${sufijo}2`,
            debeCambiarPassword: false,
          },
          {
            colegioId: colegioAId,
            email: gestorEmail,
            passwordHash: hashStaff,
            nombres: 'Gestor',
            apellidos: 'A',
            tipoDocumento: 'CC',
            numeroDocumento: `81${sufijo}3`,
            debeCambiarPassword: false,
          },
          {
            colegioId: colegioAId,
            email: portalEmail,
            passwordHash: hashStaff,
            nombres: 'Portal',
            apellidos: 'A',
            tipoDocumento: 'CC',
            numeroDocumento: `81${sufijo}4`,
            debeCambiarPassword: false,
          },
          {
            colegioId: colegioBId,
            email: adminBEmail,
            passwordHash: hashAdmin,
            nombres: 'Admin',
            apellidos: 'B',
            tipoDocumento: 'CC',
            numeroDocumento: `82${sufijo}1`,
            esAdmin: true,
            debeCambiarPassword: false,
          },
        ])
        .returning({ id: usuarios.id, email: usuarios.email });
      const adminA = creadosUsuarios.find((u) => u.email === adminEmail);
      if (adminA === undefined) throw new Error('Fixtures: admin A');
      adminAId = adminA.id;

      // Catálogo real de permisos (seed) → asignaciones por usuario.
      const catalogo = await tx.select({ id: permisos.id, codigo: permisos.codigo }).from(permisos);
      const idDe = (codigo: string): string => {
        const fila = catalogo.find((p) => p.codigo === codigo);
        if (fila === undefined) throw new Error(`Fixtures: permiso ${codigo}`);
        return fila.id;
      };
      const idUsuario = (email: string): string => {
        const fila = creadosUsuarios.find((u) => u.email === email);
        if (fila === undefined) throw new Error(`Fixtures: usuario ${email}`);
        return fila.id;
      };

      await tx.insert(usuariosPermisos).values([
        { colegioId: colegioAId, usuarioId: idUsuario(lectorEmail), permisoId: idDe('usuarios.ver') },
        {
          colegioId: colegioAId,
          usuarioId: idUsuario(gestorEmail),
          permisoId: idDe('usuarios.ver'),
        },
        {
          colegioId: colegioAId,
          usuarioId: idUsuario(gestorEmail),
          permisoId: idDe('usuarios.crear'),
        },
        {
          colegioId: colegioAId,
          usuarioId: idUsuario(gestorEmail),
          permisoId: idDe('usuarios.editar'),
        },
        { colegioId: colegioAId, usuarioId: idUsuario(portalEmail), permisoId: idDe('portal.consultar') },
      ]);
    });
  }, 30000);

  afterAll(async () => {
    await withTenant(db, platformCtx, async (tx) => {
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
    await app.close();
  }, 30000);

  it('sin sesión → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/usuarios');
    expect(res.status).toBe(401);
  });

  it('lista solo los usuarios del colegio de la sesión (RLS) y exige usuarios.ver', async () => {
    const agente = await login(lectorEmail, PASSWORD_STAFF);
    const res = await agente.get('/api/usuarios');
    expect(res.status).toBe(200);
    const emails = (res.body.data.items as Array<{ email: string }>).map((u) => u.email);
    expect(emails).toContain(adminEmail);
    expect(emails).toContain(lectorEmail);
    expect(emails).not.toContain(adminBEmail);
    expect(res.body.data.total).toBe(4);
  });

  it('sin usuarios.ver → 403 (audita PERMISSION_DENIED)', async () => {
    const agente = await login(portalEmail, PASSWORD_STAFF);
    const res = await agente.get('/api/usuarios');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('catálogo de permisos: 36 códigos agrupados por módulo', async () => {
    const agente = await login(lectorEmail, PASSWORD_STAFF);
    const res = await agente.get('/api/usuarios/permisos');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(36);
    expect(res.body.data[0]).toHaveProperty('codigo');
    expect(res.body.data[0]).toHaveProperty('modulo');
  });

  it('admin crea usuario con contraseña temporal válida para entrar', async () => {
    const agente = await login(adminEmail, PASSWORD_ADMIN);
    const emailNuevo = `nuevo@${dominioA}`;
    const res = await agente.post('/api/usuarios').send({
      nombres: 'Nuevo',
      apellidos: 'Docente',
      email: emailNuevo,
      tipoDocumento: 'CC',
      numeroDocumento: `83${sufijo}1`,
      permisos: ['calificaciones.editar'],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.usuario).toMatchObject({
      email: emailNuevo,
      activo: true,
      debeCambiarPassword: true,
      esAdmin: false,
    });
    expect(res.body.data.usuario.permisos).toEqual(['calificaciones.editar']);

    const temporal = res.body.data.passwordTemporal as string;
    expect(temporal).toHaveLength(12);
    expect(temporal).toMatch(/[A-Z]/);
    expect(temporal).toMatch(/[a-z]/);
    expect(temporal).toMatch(/[0-9]/);
    expect(temporal).toMatch(/[!@#$%&*]/);

    // La temporal sirve para entrar, pero obliga a cambiarla.
    const agenteNuevo = request.agent(app.getHttpServer());
    const loginNuevo = await agenteNuevo
      .post('/api/auth/login')
      .send({ email: emailNuevo, password: temporal });
    expect(loginNuevo.status).toBe(200);
    expect(loginNuevo.body.data.usuario.debeCambiarPassword).toBe(true);

    // Auditoría del alta.
    const eventos = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ accion: auditLog.accion, entidad: auditLog.entidad })
        .from(auditLog)
        .where(eq(auditLog.entidadId, res.body.data.usuario.id as string)),
    );
    expect(eventos.some((e) => e.accion === 'CREATE' && e.entidad === 'usuarios')).toBe(true);
  });

  it('rechaza correo fuera del dominio institucional', async () => {
    const agente = await login(adminEmail, PASSWORD_ADMIN);
    const res = await agente.post('/api/usuarios').send({
      nombres: 'Externo',
      apellidos: 'Gmail',
      email: 'externo@gmail.com',
      tipoDocumento: 'CC',
      numeroDocumento: `83${sufijo}2`,
      permisos: ['portal.consultar'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(String(res.body.error.message)).toContain(dominioA);
  });

  it('rechaza correo duplicado (409)', async () => {
    const agente = await login(adminEmail, PASSWORD_ADMIN);
    const res = await agente.post('/api/usuarios').send({
      nombres: 'Duplicado',
      apellidos: 'Docente',
      email: lectorEmail,
      tipoDocumento: 'CC',
      numeroDocumento: `83${sufijo}3`,
      permisos: ['portal.consultar'],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_EXISTS');
  });

  it('solo un admin puede crear otro admin (gestor recibe 403)', async () => {
    const agente = await login(gestorEmail, PASSWORD_STAFF);
    const res = await agente.post('/api/usuarios').send({
      nombres: 'Otro',
      apellidos: 'Admin',
      email: `admin2@${dominioA}`,
      tipoDocumento: 'CC',
      numeroDocumento: `83${sufijo}4`,
      esAdmin: true,
    });
    expect(res.status).toBe(403);
  });

  it('no puede desactivar su propia cuenta', async () => {
    const agente = await login(adminEmail, PASSWORD_ADMIN);
    const res = await agente.patch(`/api/usuarios/${adminAId}`).send({ activo: false });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('reemplaza permisos y el detalle los refleja', async () => {
    const agente = await login(adminEmail, PASSWORD_ADMIN);
    const lista = await agente.get('/api/usuarios');
    const lector = (lista.body.data.items as Array<{ id: string; email: string }>).find(
      (u) => u.email === lectorEmail,
    );
    if (lector === undefined) throw new Error('lector no encontrado');

    const res = await agente
      .put(`/api/usuarios/${lector.id}/permisos`)
      .send({ permisos: ['usuarios.ver', 'calificaciones.ver_todas'] });
    expect(res.status).toBe(200);
    expect(res.body.data.permisos).toEqual(['calificaciones.ver_todas', 'usuarios.ver']);

    const detalle = await agente.get(`/api/usuarios/${lector.id}`);
    expect(detalle.body.data.permisos).toContain('calificaciones.ver_todas');
  });

  it('rechaza permisos inexistentes en el catálogo', async () => {
    const agente = await login(adminEmail, PASSWORD_ADMIN);
    const lista = await agente.get('/api/usuarios');
    const gestor = (lista.body.data.items as Array<{ id: string; email: string }>).find(
      (u) => u.email === gestorEmail,
    );
    if (gestor === undefined) throw new Error('gestor no encontrado');
    const res = await agente
      .put(`/api/usuarios/${gestor.id}/permisos`)
      .send({ permisos: ['hackear.todo'] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.permisos).toContain('hackear.todo');
  });

  it('reset de contraseña: invalida la anterior y revoca las sesiones activas', async () => {
    // El lector tiene una sesión abierta antes del reset.
    const agenteLector = await login(lectorEmail, PASSWORD_STAFF);
    expect((await agenteLector.get('/api/auth/me')).status).toBe(200);

    const admin = await login(adminEmail, PASSWORD_ADMIN);
    const lista = await admin.get('/api/usuarios');
    const lector = (lista.body.data.items as Array<{ id: string; email: string }>).find(
      (u) => u.email === lectorEmail,
    );
    if (lector === undefined) throw new Error('lector no encontrado');

    const reset = await admin.post(`/api/usuarios/${lector.id}/reset-password`);
    expect(reset.status).toBe(200);
    const nueva = reset.body.data.passwordTemporal as string;
    expect(nueva).toHaveLength(12);

    // La sesión previa quedó revocada.
    const meViejo = await agenteLector.get('/api/auth/me');
    expect(meViejo.status).toBe(401);

    // La contraseña anterior ya no sirve; la temporal sí (y obliga cambio).
    const vieja = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lectorEmail, password: PASSWORD_STAFF });
    expect(vieja.status).toBe(401);

    const nuevaLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lectorEmail, password: nueva });
    expect(nuevaLogin.status).toBe(200);
    expect(nuevaLogin.body.data.usuario.debeCambiarPassword).toBe(true);
  });

  it('no permite resetear la propia contraseña desde este módulo', async () => {
    const agente = await login(adminEmail, PASSWORD_ADMIN);
    const res = await agente.post(`/api/usuarios/${adminAId}/reset-password`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Cambiar contraseña');
  });
});