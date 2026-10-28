/**
 * Matrículas (e2e) — BD real, dos tenants.
 *
 * Cubre el camino del módulo:
 *  - cursos del año vigente y alta individual
 *  - listado con curso y el CURSO de Personas → Estudiantes
 *  - duplicado en el año (409) y permiso `matriculas.administrar`
 *  - aislamiento entre colegios (no se matricula un estudiante ajeno)
 *  - importación CSV: crea, reporta errores por fila y crea la ficha cuando
 *    la cuenta existe y la fila trae fecha de nacimiento
 *  - baja lógica (RETIRADO) y su efecto en el contador del onboarding
 */
import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  aniosLectivos,
  colegios,
  estudiantes,
  grados,
  grupos,
  matriculas,
  permisos,
  roles,
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

const PASSWORD = 'Matriculas123!';
const platformCtx: TenantContext = { colegioId: SIN_COLEGIO_ID, isPlatformAdmin: true };

interface Tenant {
  colegioId: string;
  subdominio: string;
  adminEmail: string;
  staffEmail: string;
  sedeId: string;
  anioLectivoId: string;
  cursoId: string;
  /** Documento del admin (cuenta sin rol de estudiante: la usa el CSV). */
  adminDocumento: string;
  /** Estudiante con ficha (se matricula individualmente). */
  estudianteId: string;
  estudianteDocumento: string;
  /** Cuenta con rol Estudiante SIN ficha (la crea la importación). */
  cuentaSinFichaId: string;
  cuentaSinFichaDocumento: string;
}

describe('Matrículas (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  // Sufijo aleatorio: varios specs corren en hilos en paralelo y con
  // `Date.now()` compartían milisegundo (choque de codigo_dane/subdominio).
  const sufijo = String(randomInt(0, 100_000_000)).padStart(8, '0');
  let tenantA: Tenant;
  let tenantB: Tenant;
  let fixturesListas = false;
  let matriculaA = '';

  async function login(usuario: string) {
    const agente = request.agent(app.getHttpServer());
    await agente.post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(200);
    return agente;
  }

  /** Arma un colegio completo: admin, staff, sede, año, grado, curso y estudiantes. */
  async function crearTenant(nombre: string, indice: number, hash: string): Promise<Tenant> {
    const subdominio = `mat-${sufijo}-${indice}`;
    const adminEmail = `admin@${subdominio}`;
    const staffEmail = `staff@${subdominio}`;

    return withTenant(db, platformCtx, async (tx) => {
      const [colegio] = await tx
        .insert(colegios)
        .values({
          nombre,
          codigoDane: `2${sufijo}${indice}`,
          subdominio,
          municipio: 'Plato',
          departamento: 'Magdalena',
          email: `contacto@${subdominio}`,
          calendario: 'A',
          estado: 'ACTIVO',
          onboardingCompletadoEn: new Date(),
        })
        .returning({ id: colegios.id });
      if (colegio === undefined) throw new Error('Fixtures: colegio');
      const colegioId = colegio.id;

      const [rolEstudiante] = await tx
        .insert(roles)
        .values({
          colegioId,
          nombre: 'Estudiante',
          tipoPersona: 'ESTUDIANTE',
          esPredeterminado: true,
        })
        .returning({ id: roles.id });

      const [anio] = await tx
        .insert(aniosLectivos)
        .values({
          colegioId,
          anio: 2026,
          fechaInicio: '2026-02-02',
          fechaFin: '2026-11-30',
          estado: 'ACTIVO',
        })
        .returning({ id: aniosLectivos.id });

      const [sede] = await tx
        .insert(sedes)
        .values({ colegioId, nombre: 'Sede Principal', jornadas: ['MANANA'] })
        .returning({ id: sedes.id });

      const [grado] = await tx
        .insert(grados)
        .values({ colegioId, nivel: 'BACHILLERATO', numero: 6, nombre: '6°' })
        .returning({ id: grados.id });
      if (anio === undefined || sede === undefined || grado === undefined) {
        throw new Error('Fixtures: estructura');
      }

      const [curso] = await tx
        .insert(grupos)
        .values({
          colegioId,
          sedeId: sede.id,
          anioLectivoId: anio.id,
          gradoId: grado.id,
          letra: 'A',
          jornada: 'MANANA',
        })
        .returning({ id: grupos.id });
      if (curso === undefined) throw new Error('Fixtures: curso');

      const base = Number(sufijo.slice(-4)) * 10 + indice;
      const documentoEstudiante = `10${base}1`;
      const documentoCuenta = `10${base}2`;
      const documentoAdmin = `9${sufijo}${indice}1`;

      const creados = await tx
        .insert(usuarios)
        .values([
          {
            colegioId,
            usuario: adminEmail,
            passwordHash: hash,
            nombres: 'Admin',
            apellidos: `Colegio ${indice}`,
            tipoDocumento: 'CC',
            numeroDocumento: documentoAdmin,
            esAdmin: true,
            debeCambiarPassword: false,
          },
          {
            colegioId,
            usuario: staffEmail,
            passwordHash: hash,
            nombres: 'Staff',
            apellidos: `Colegio ${indice}`,
            tipoDocumento: 'CC',
            numeroDocumento: `9${sufijo}${indice}2`,
            debeCambiarPassword: false,
          },
          {
            colegioId,
            usuario: `estudiante.${indice}@${subdominio}`,
            passwordHash: hash,
            nombres: 'Estudiante',
            apellidos: `Ficha ${indice}`,
            tipoDocumento: 'TI',
            numeroDocumento: documentoEstudiante,
            debeCambiarPassword: false,
          },
          {
            colegioId,
            usuario: `cuenta.${indice}@${subdominio}`,
            passwordHash: hash,
            nombres: 'Cuenta',
            apellidos: `Sin Ficha ${indice}`,
            tipoDocumento: 'TI',
            numeroDocumento: documentoCuenta,
            rolId: rolEstudiante?.id ?? null,
            debeCambiarPassword: false,
          },
        ])
        .returning({ id: usuarios.id, usuario: usuarios.usuario });

      const admin = creados.find((u) => u.usuario === adminEmail);
      const staff = creados.find((u) => u.usuario === staffEmail);
      const estudiante = creados.find((u) => u.usuario === `estudiante.${indice}@${subdominio}`);
      const cuenta = creados.find((u) => u.usuario === `cuenta.${indice}@${subdominio}`);
      if (
        admin === undefined ||
        staff === undefined ||
        estudiante === undefined ||
        cuenta === undefined
      ) {
        throw new Error('Fixtures: usuarios');
      }

      // El staff SOLO tiene estudiantes.ver: el 403 de escritura es por permiso.
      const [permiso] = await tx
        .select({ id: permisos.id })
        .from(permisos)
        .where(eq(permisos.codigo, 'estudiantes.ver'))
        .limit(1);
      if (permiso === undefined) throw new Error('Fixtures: permiso estudiantes.ver');
      await tx
        .insert(usuariosPermisos)
        .values({ colegioId, usuarioId: staff.id, permisoId: permiso.id });

      await tx.insert(estudiantes).values({
        colegioId,
        usuarioId: estudiante.id,
        codigoMatricula: documentoEstudiante,
        fechaNacimiento: '2013-04-18',
      });

      return {
        colegioId,
        subdominio,
        adminEmail,
        staffEmail,
        sedeId: sede.id,
        anioLectivoId: anio.id,
        cursoId: curso.id,
        adminDocumento: documentoAdmin,
        estudianteId: '',
        estudianteDocumento: documentoEstudiante,
        cuentaSinFichaId: cuenta.id,
        cuentaSinFichaDocumento: documentoCuenta,
      };
    }).then(async (tenant) => {
      // La ficha se creó sin devolver su id: se resuelve aquí.
      const [ficha] = await withTenant(db, platformCtx, (tx) =>
        tx
          .select({ id: estudiantes.id })
          .from(estudiantes)
          .where(
            and(
              eq(estudiantes.colegioId, tenant.colegioId),
              eq(estudiantes.codigoMatricula, tenant.estudianteDocumento),
            ),
          )
          .limit(1),
      );
      return { ...tenant, estudianteId: ficha?.id ?? '' };
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    db = moduleRef.get<Database>(DATABASE);

    const hash = await bcrypt.hash(PASSWORD, 4);
    tenantA = await crearTenant('Colegio Matrículas A', 1, hash);
    tenantB = await crearTenant('Colegio Matrículas B', 2, hash);
    fixturesListas = true;
  });

  afterAll(async () => {
    // Si beforeAll no llegó a crear los tenants no hay nada que limpiar.
    if (fixturesListas) {
      await withTenant(db, platformCtx, async (tx) => {
        for (const colegioId of [tenantA.colegioId, tenantB.colegioId]) {
          await tx.delete(matriculas).where(eq(matriculas.colegioId, colegioId));
          await tx.delete(estudiantes).where(eq(estudiantes.colegioId, colegioId));
          await tx.delete(aniosLectivos).where(eq(aniosLectivos.colegioId, colegioId));
          await tx.delete(sedes).where(eq(sedes.colegioId, colegioId));
          await tx.delete(grados).where(eq(grados.colegioId, colegioId));
          await tx.delete(usuarios).where(eq(usuarios.colegioId, colegioId));
          await tx.delete(roles).where(eq(roles.colegioId, colegioId));
          await tx.delete(colegios).where(eq(colegios.id, colegioId));
        }
      });
    }
    await app.close();
  });

  it('las pestañas de personas devuelven los datos personales normalizados', async () => {
    const agente = await login(tenantA.adminEmail);

    // Estudiantes y acudientes usan `coalesce(..., '')`: nunca null en la API.
    const estudiantes = await agente.get('/api/personas/estudiantes').expect(200);
    expect(estudiantes.body.data.total).toBeGreaterThan(0);
    expect(typeof estudiantes.body.data.items[0].nombres).toBe('string');

    const acudientes = await agente.get('/api/personas/acudientes').expect(200);
    expect(Array.isArray(acudientes.body.data.items)).toBe(true);

    const empleados = await agente.get('/api/personas/empleados').expect(200);
    expect(empleados.body.data.total).toBeGreaterThan(0);
  });

  it('lista los cursos del año vigente', async () => {
    const agente = await login(tenantA.adminEmail);
    const { body } = await agente.get('/api/matriculas/cursos').expect(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: tenantA.cursoId,
      nombre: '6° A',
      sedeNombre: 'Sede Principal',
      jornada: 'MANANA',
      anio: 2026,
    });
  });

  it('el staff puede leer pero no matricular (403 sin matriculas.administrar)', async () => {
    const agente = await login(tenantA.staffEmail);
    await agente.get('/api/matriculas').expect(200);
    await agente
      .post('/api/matriculas')
      .send({ estudianteId: tenantA.estudianteId, cursoId: tenantA.cursoId })
      .expect(403);
  });

  it('matricula individualmente y el listado trae estudiante y curso', async () => {
    const agente = await login(tenantA.adminEmail);
    const { body } = await agente
      .post('/api/matriculas')
      .send({ estudianteId: tenantA.estudianteId, cursoId: tenantA.cursoId })
      .expect(201);
    matriculaA = body.data.id;

    const listado = await agente.get(`/api/matriculas?cursoId=${tenantA.cursoId}`).expect(200);
    expect(listado.body.data.total).toBe(1);
    expect(listado.body.data.items[0]).toMatchObject({
      id: matriculaA,
      numeroDocumento: tenantA.estudianteDocumento,
      curso: '6° A',
      sede: 'Sede Principal',
      estado: 'MATRICULADO',
    });

    // Filtros por año y búsqueda por nombre.
    const filtrado = await agente
      .get(`/api/matriculas?anioLectivoId=${tenantA.anioLectivoId}&q=Estudiante`)
      .expect(200);
    expect(filtrado.body.data.total).toBe(1);
    expect(filtrado.body.data.items[0].id).toBe(matriculaA);

    // Personas → Estudiantes ya muestra el CURSO de la matrícula vigente.
    const personas = await agente.get('/api/personas/estudiantes').expect(200);
    const fila = personas.body.data.items.find(
      (item: { id: string }) => item.id === tenantA.estudianteId,
    );
    expect(fila?.curso).toBe('6° A');
  });

  it('rechaza una segunda matrícula del mismo estudiante en el año', async () => {
    const agente = await login(tenantA.adminEmail);
    await agente
      .post('/api/matriculas')
      .send({ estudianteId: tenantA.estudianteId, cursoId: tenantA.cursoId })
      .expect(409);
  });

  it('devuelve 404 si el estudiante no existe en el colegio', async () => {
    const agente = await login(tenantA.adminEmail);
    await agente
      .post('/api/matriculas')
      .send({
        estudianteId: '00000000-0000-4000-8000-000000000000',
        cursoId: tenantA.cursoId,
      })
      .expect(404);
  });

  it('no cruza tenants: el curso y el estudiante ajenos dan 404', async () => {
    const agenteB = await login(tenantB.adminEmail);
    const cursosB = await agenteB.get('/api/matriculas/cursos').expect(200);
    expect(cursosB.body.data).toHaveLength(1);
    expect(cursosB.body.data[0].id).toBe(tenantB.cursoId);

    const listadoB = await agenteB.get('/api/matriculas').expect(200);
    expect(listadoB.body.data.total).toBe(0);

    // Estudiante del colegio A con curso del colegio A, desde la sesión de B.
    await agenteB
      .post('/api/matriculas')
      .send({ estudianteId: tenantA.estudianteId, cursoId: tenantA.cursoId })
      .expect(404);
  });

  it('importa el CSV: crea la fila válida y reporta los errores por fila', async () => {
    const agente = await login(tenantA.adminEmail);
    const { body } = await agente
      .post('/api/matriculas/importar')
      .send({
        filas: [
          // Fila 1: la cuenta existe sin ficha y la fila no trae fecha → error.
          {
            documento: tenantA.cuentaSinFichaDocumento,
            sede: 'Sede Principal',
            grado: '6',
            letra: 'A',
            jornada: 'MANANA',
          },
          // Fila 2: misma cuenta, ahora con fecha → crea la ficha y matricula.
          {
            documento: tenantA.cuentaSinFichaDocumento,
            nombres: 'Cuenta',
            apellidos: 'Sin Ficha',
            correo: `cuenta.1@${tenantA.subdominio}`,
            sede: 'sede principal',
            grado: '6°',
            letra: 'a',
            jornada: 'Mañana',
            fechaNacimiento: '2012-09-30',
          },
          // Fila 3: documento inexistente.
          {
            documento: '99999999',
            sede: 'Sede Principal',
            grado: '6',
            letra: 'A',
            jornada: 'MANANA',
          },
          // Fila 4: ya tiene matrícula en el año.
          {
            documento: tenantA.estudianteDocumento,
            sede: 'Sede Principal',
            grado: '6',
            letra: 'A',
            jornada: 'MANANA',
          },
          // Fila 5: curso que no existe en el colegio.
          {
            documento: tenantA.cuentaSinFichaDocumento,
            sede: 'Sede Fantasma',
            grado: '6',
            letra: 'A',
            jornada: 'MANANA',
          },
          // Fila 6: cuenta sin rol de estudiante (el admin).
          {
            documento: tenantA.adminDocumento,
            sede: 'Sede Principal',
            grado: '6',
            letra: 'A',
            jornada: 'MANANA',
            fechaNacimiento: '1990-01-01',
          },
        ],
      })
      .expect(200);

    expect(body.data.creadas).toBe(1);
    expect(body.data.errores).toHaveLength(5);
    expect(body.data.errores[0]).toMatchObject({ fila: 1 });
    expect(body.data.errores[0].motivo).toContain('Falta fechaNacimiento');
    expect(body.data.errores[1]).toMatchObject({ fila: 3 });
    expect(body.data.errores[1].motivo).toContain('No existe una cuenta con el documento 99999999');
    expect(body.data.errores[2]).toMatchObject({ fila: 4 });
    expect(body.data.errores[2].motivo).toContain('ya tiene matrícula en 2026');
    expect(body.data.errores[3]).toMatchObject({ fila: 5 });
    expect(body.data.errores[3].motivo).toContain('No existe el curso');
    expect(body.data.errores[4]).toMatchObject({ fila: 6 });
    expect(body.data.errores[4].motivo).toContain('no tiene rol de estudiante');

    // La ficha se creó para la cuenta que no la tenía (con su fecha de nacimiento).
    const [ficha] = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ id: estudiantes.id, codigoMatricula: estudiantes.codigoMatricula })
        .from(estudiantes)
        .where(
          and(
            eq(estudiantes.colegioId, tenantA.colegioId),
            eq(estudiantes.usuarioId, tenantA.cuentaSinFichaId),
          ),
        )
        .limit(1),
    );
    expect(ficha?.codigoMatricula).toBe(tenantA.cuentaSinFichaDocumento);
  });

  it('la baja deja la matrícula en RETIRADO y actualiza el contador del onboarding', async () => {
    const agente = await login(tenantA.adminEmail);

    // Una matrícula inexistente responde 404 (no borra nada).
    await agente.delete('/api/matriculas/00000000-0000-4000-8000-000000000001').expect(404);

    await agente.delete(`/api/matriculas/${matriculaA}`).expect(200);

    const listado = await agente.get(`/api/matriculas?cursoId=${tenantA.cursoId}`).expect(200);
    expect(listado.body.data.items[0].estado).toBe('RETIRADO');

    const onboarding = await agente.get('/api/onboarding').expect(200);
    expect(onboarding.body.data.estudiantes.matriculados).toBe(1);
    expect(
      onboarding.body.data.checklist.find((c: { clave: string }) => c.clave === 'estudiantes')
        ?.hecho,
    ).toBe(true);
  });
});
