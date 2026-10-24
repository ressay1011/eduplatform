/**
 * Onboarding (e2e) — BD real. Cubre el camino completo del wizard:
 *  - estado inicial y permiso de admin (staff con `configuracion.editar` → 403)
 *  - paso 1: identidad + año lectivo + períodos
 *  - paso 2: sede con jornadas
 *  - paso 3: generador de cursos (grados × letras) y validación de jornada
 *  - finalizar: mínimo sede+curso y checklist actualizado
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  aniosLectivos,
  colegios,
  grados,
  permisos,
  sedes,
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

const PASSWORD = 'Onboarding123!';
const platformCtx: TenantContext = { colegioId: SIN_COLEGIO_ID, isPlatformAdmin: true };

describe('Onboarding (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const sufijo = String(Date.now()).slice(-8);
  const subdominio = `onb-${sufijo}`;
  const dominio = `onb-${sufijo}.test`;
  const codigoDane = `1${sufijo}000`;

  let colegioId = '';
  let adminEmail = '';
  let staffEmail = '';
  let sedeId = '';

  async function login(email: string) {
    const agente = request.agent(app.getHttpServer());
    await agente.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agente;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = moduleRef.get<Database>(DATABASE);

    const hash = await bcrypt.hash(PASSWORD, 4);

    await withTenant(db, platformCtx, async (tx) => {
      const [colegio] = await tx
        .insert(colegios)
        .values({
          nombre: 'Colegio Onboarding',
          codigoDane,
          subdominio,
          dominioEmail: dominio,
          municipio: 'Plato',
          departamento: 'Magdalena',
          email: `contacto@${dominio}`,
          calendario: 'A',
          estado: 'ACTIVO',
        })
        .returning({ id: colegios.id });
      if (colegio === undefined) throw new Error('Fixtures: colegio');
      colegioId = colegio.id;

      adminEmail = `admin@${dominio}`;
      staffEmail = `staff@${dominio}`;

      const creados = await tx
        .insert(usuarios)
        .values([
          {
            colegioId,
            email: adminEmail,
            passwordHash: hash,
            nombres: 'Admin',
            apellidos: 'Onboarding',
            tipoDocumento: 'CC',
            numeroDocumento: `9${sufijo}1`,
            esAdmin: true,
            debeCambiarPassword: false,
          },
          {
            colegioId,
            email: staffEmail,
            passwordHash: hash,
            nombres: 'Staff',
            apellidos: 'Onboarding',
            tipoDocumento: 'CC',
            numeroDocumento: `9${sufijo}2`,
            debeCambiarPassword: false,
          },
        ])
        .returning({ id: usuarios.id, email: usuarios.email });

      const staff = creados.find((u) => u.email === staffEmail);
      const [permiso] = await tx
        .select({ id: permisos.id })
        .from(permisos)
        .where(eq(permisos.codigo, 'configuracion.editar'))
        .limit(1);
      if (staff === undefined || permiso === undefined) throw new Error('Fixtures: staff/permiso');

      // El staff TIENE el permiso: así el 403 que se prueba es el de «solo admin».
      await tx
        .insert(usuariosPermisos)
        .values({ colegioId, usuarioId: staff.id, permisoId: permiso.id });
    });
  });

  afterAll(async () => {
    await withTenant(db, platformCtx, async (tx) => {
      // El año lectivo cuelga con restrict: al borrarlo caen períodos y cursos.
      await tx.delete(aniosLectivos).where(eq(aniosLectivos.colegioId, colegioId));
      await tx.delete(sedes).where(eq(sedes.colegioId, colegioId));
      await tx.delete(grados).where(eq(grados.colegioId, colegioId));
      await tx.delete(usuarios).where(eq(usuarios.colegioId, colegioId));
      await tx.delete(colegios).where(eq(colegios.id, colegioId));
    });
    await app.close();
  });

  it('arranca en el paso 1, sin sedes y sin completar', async () => {
    const agente = await login(adminEmail);
    const { body } = await agente.get('/api/onboarding').expect(200);
    expect(body.data.paso).toBe(1);
    expect(body.data.completado).toBe(false);
    expect(body.data.sedes).toHaveLength(0);
    expect(body.data.colegio.subdominio).toBe(subdominio);
  });

  it('un usuario con permiso pero sin ser admin recibe 403', async () => {
    const agente = await login(staffEmail);
    await agente.get('/api/onboarding').expect(403);
  });

  it('paso 1 guarda identidad, año lectivo y períodos', async () => {
    const agente = await login(adminEmail);
    const { body } = await agente
      .patch('/api/onboarding/colegio')
      .send({
        nombre: 'I.E.T.D. Onboarding',
        nit: `9${sufijo}-1`,
        codigoDane,
        subdominio,
        dominioEmail: dominio,
        municipio: 'Plato',
        departamento: 'Magdalena',
        direccion: 'Calle 1 # 2-3',
        telefono: '3001234567',
        email: `rectoria@${dominio}`,
        calendario: 'A',
        anioLectivo: 2026,
        periodos: [
          {
            numero: 1,
            nombre: 'Período 1',
            fechaInicio: '2026-02-02',
            fechaFin: '2026-04-24',
          },
          {
            numero: 2,
            nombre: 'Período 2',
            fechaInicio: '2026-04-28',
            fechaFin: '2026-07-03',
          },
        ],
      })
      .expect(200);

    expect(body.data.paso).toBeGreaterThanOrEqual(2);
    expect(body.data.anioLectivo?.anio).toBe(2026);
    expect(body.data.periodos).toHaveLength(2);
  });

  it('paso 2 crea la sede con sus jornadas', async () => {
    const agente = await login(adminEmail);
    const { body } = await agente
      .put('/api/onboarding/sedes')
      .send({
        nombre: 'Sede Principal',
        direccion: 'Calle 12 # 8-45',
        jornadas: ['MANANA', 'TARDE'],
      })
      .expect(200);

    expect(body.data.sedes).toHaveLength(1);
    expect(body.data.sedes[0].jornadas).toEqual(['MANANA', 'TARDE']);
    sedeId = body.data.sedes[0].id;
  });

  it('rechaza una jornada que la sede no declaró', async () => {
    const agente = await login(adminEmail);
    await agente
      .post('/api/onboarding/estructura')
      .send({ sedeId, jornada: 'NOCTURNA', grados: [6], letras: ['A'] })
      .expect(400);
  });

  it('paso 3 genera los cursos (grados × letras)', async () => {
    const agente = await login(adminEmail);
    const { body } = await agente
      .post('/api/onboarding/estructura')
      .send({ sedeId, jornada: 'MANANA', grados: [6, 7], letras: ['A', 'B'] })
      .expect(201);

    expect(body.data.estructura.cursos).toBe(4);
    expect(body.data.estructura.grados).toBe(2);
    expect(body.data.paso).toBeGreaterThanOrEqual(4);
  });

  it('finalizar cierra el wizard y el checklist queda al día', async () => {
    const agente = await login(adminEmail);
    const { body } = await agente.post('/api/onboarding/finalizar').expect(200);
    expect(body.data.completado).toBe(true);

    const estado = body.data.estado;
    expect(estado.checklist.find((c: { clave: string }) => c.clave === 'cursos')?.hecho).toBe(true);
    expect(estado.checklist.find((c: { clave: string }) => c.clave === 'sedes')?.hecho).toBe(true);
  });
});
