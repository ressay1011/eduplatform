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
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  acudientesEstudiantes,
  aniosLectivos,
  auditLog,
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
import { MatriculasRepository } from '../matriculas.repository';

const PASSWORD = 'Matriculas123!';
const platformCtx: TenantContext = { colegioId: SIN_COLEGIO_ID, isPlatformAdmin: true };

interface Tenant {
  colegioId: string;
  codigo: string;
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
  // `Date.now()` compartían milisegundo (choque de codigo_dane/codigo).
  const sufijo = String(randomInt(0, 100_000_000)).padStart(8, '0');
  let tenantA: Tenant;
  let tenantB: Tenant;
  let fixturesListas = false;
  let matriculaA = '';

  /** Estado de la ficha del estudiante, por documento (pasando por RLS). */
  async function estadoDeEstudiante(colegioId: string, documento: string): Promise<string | null> {
    const [fila] = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ estado: estudiantes.estado })
        .from(estudiantes)
        .innerJoin(usuarios, eq(usuarios.id, estudiantes.usuarioId))
        .where(and(eq(estudiantes.colegioId, colegioId), eq(usuarios.numeroDocumento, documento)))
        .limit(1),
    );
    return fila?.estado ?? null;
  }

  async function login(usuario: string) {
    const agente = request.agent(app.getHttpServer());
    await agente.post('/api/auth/login').send({ usuario, password: PASSWORD }).expect(200);
    return agente;
  }

  /** Arma un colegio completo: admin, staff, sede, año, grado, curso y estudiantes. */
  async function crearTenant(nombre: string, indice: number, hash: string): Promise<Tenant> {
    const codigo = `mat-${sufijo}-${indice}`;
    const adminEmail = `admin@${codigo}`;
    const staffEmail = `staff@${codigo}`;

    return withTenant(db, platformCtx, async (tx) => {
      const [colegio] = await tx
        .insert(colegios)
        .values({
          nombre,
          codigoDane: `2${sufijo}${indice}`,
          codigo: codigo,
          municipio: 'Plato',
          departamento: 'Magdalena',
          email: `contacto@${codigo}`,
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
            usuario: `estudiante.${indice}@${codigo}`,
            passwordHash: hash,
            nombres: 'Estudiante',
            apellidos: `Ficha ${indice}`,
            tipoDocumento: 'TI',
            numeroDocumento: documentoEstudiante,
            debeCambiarPassword: false,
          },
          {
            colegioId,
            usuario: `cuenta.${indice}@${codigo}`,
            passwordHash: hash,
            nombres: 'Cuenta',
            apellidos: `Sin Ficha ${indice}`,
            tipoDocumento: 'TI',
            numeroDocumento: documentoCuenta,
            rolId: rolEstudiante?.id ?? null,
            debeCambiarPassword: false,
          },
          {
            colegioId,
            usuario: `acudiente.${indice}@${codigo}`,
            passwordHash: hash,
            nombres: 'Acudiente',
            apellidos: `Familia ${indice}`,
            tipoDocumento: 'CC',
            numeroDocumento: `8${sufijo}${indice}1`,
            debeCambiarPassword: false,
          },
        ])
        .returning({ id: usuarios.id, usuario: usuarios.usuario });

      const admin = creados.find((u) => u.usuario === adminEmail);
      const staff = creados.find((u) => u.usuario === staffEmail);
      const estudiante = creados.find((u) => u.usuario === `estudiante.${indice}@${codigo}`);
      const cuenta = creados.find((u) => u.usuario === `cuenta.${indice}@${codigo}`);
      const acudiente = creados.find((u) => u.usuario === `acudiente.${indice}@${codigo}`);
      if (
        admin === undefined ||
        staff === undefined ||
        estudiante === undefined ||
        cuenta === undefined ||
        acudiente === undefined
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

      const [ficha] = await tx
        .insert(estudiantes)
        .values({
          colegioId,
          usuarioId: estudiante.id,
          codigoMatricula: documentoEstudiante,
          fechaNacimiento: '2013-04-18',
        })
        .returning({ id: estudiantes.id });
      if (ficha === undefined) throw new Error('Fixtures: ficha del estudiante');

      // Acudiente a cargo: alimenta la pestaña «Acudientes» de Personas, que
      // normaliza nombres/apellidos/documento a '' cuando llegan nulos.
      await tx.insert(acudientesEstudiantes).values({
        colegioId,
        acudienteId: acudiente.id,
        estudianteId: ficha.id,
        parentesco: 'Madre',
        telefono: '3001234567',
      });

      return {
        colegioId,
        codigo,
        adminEmail,
        staffEmail,
        sedeId: sede.id,
        anioLectivoId: anio.id,
        cursoId: curso.id,
        adminDocumento: documentoAdmin,
        estudianteId: ficha.id,
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

  /** Crea un año lectivo extra del colegio (sin cursos) y devuelve su id. */
  async function crearAnioLectivo(
    colegioId: string,
    anio: number,
    estado: 'CONFIGURACION' | 'ACTIVO' | 'CERRADO',
  ): Promise<string> {
    const [fila] = await withTenant(db, platformCtx, (tx) =>
      tx
        .insert(aniosLectivos)
        .values({
          colegioId,
          anio,
          fechaInicio: `${anio}-02-02`,
          fechaFin: `${anio}-11-30`,
          estado,
        })
        .returning({ id: aniosLectivos.id }),
    );
    if (fila === undefined) throw new Error('Fixtures: año lectivo');
    return fila.id;
  }

  /** Borra el año de prueba; sus grupos y matrículas caen por cascada. */
  async function borrarAnioLectivo(anioId: string): Promise<void> {
    await withTenant(db, platformCtx, (tx) =>
      tx.delete(aniosLectivos).where(eq(aniosLectivos.id, anioId)),
    );
  }

  /** Cambia el estado de un año lectivo (los tests lo restauran en su `finally`). */
  async function estadoDeAnio(
    anioId: string,
    estado: 'CONFIGURACION' | 'ACTIVO' | 'CERRADO',
  ): Promise<void> {
    await withTenant(db, platformCtx, (tx) =>
      tx.update(aniosLectivos).set({ estado }).where(eq(aniosLectivos.id, anioId)),
    );
  }

  /** Año en el estado pedido con un curso dentro, copiando sede y grado del real. */
  async function crearCursoEnAnio(
    colegioId: string,
    cursoOrigenId: string,
    anio: number,
    estado: 'CONFIGURACION' | 'ACTIVO' | 'CERRADO',
  ): Promise<{ anioId: string; cursoId: string }> {
    return withTenant(db, platformCtx, async (tx) => {
      const [origen] = await tx
        .select({ sedeId: grupos.sedeId, gradoId: grupos.gradoId })
        .from(grupos)
        .where(eq(grupos.id, cursoOrigenId))
        .limit(1);
      if (origen === undefined) throw new Error('Fixtures: curso origen');

      const [anioFila] = await tx
        .insert(aniosLectivos)
        .values({
          colegioId,
          anio,
          fechaInicio: `${anio}-02-02`,
          fechaFin: `${anio}-11-30`,
          estado,
        })
        .returning({ id: aniosLectivos.id });
      if (anioFila === undefined) throw new Error('Fixtures: año lectivo');

      const [curso] = await tx
        .insert(grupos)
        .values({
          colegioId,
          sedeId: origen.sedeId,
          anioLectivoId: anioFila.id,
          gradoId: origen.gradoId,
          letra: 'A',
          jornada: 'MANANA',
        })
        .returning({ id: grupos.id });
      if (curso === undefined) throw new Error('Fixtures: curso del año');
      return { anioId: anioFila.id, cursoId: curso.id };
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
          await tx
            .delete(acudientesEstudiantes)
            .where(eq(acudientesEstudiantes.colegioId, colegioId));
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
    const estudiantes = await agente.get('/api/personas/estudiantes?q=a').expect(200);
    expect(estudiantes.body.data.total).toBeGreaterThan(0);
    expect(typeof estudiantes.body.data.items[0].nombres).toBe('string');

    const acudientes = await agente.get('/api/personas/acudientes?q=a').expect(200);
    // El fixture liga un acudiente a la ficha: aquí se ejercita el mapa que
    // normaliza a '' los campos personales opcionales.
    expect(acudientes.body.data.total).toBeGreaterThan(0);
    expect(typeof acudientes.body.data.items[0].nombres).toBe('string');
    expect(acudientes.body.data.items[0].estudiantes.length).toBeGreaterThan(0);

    const empleados = await agente.get('/api/personas/empleados?q=a').expect(200);
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

  it('un año más reciente sin cerrar no se lleva los cursos (manda el ACTIVO)', async () => {
    const agente = await login(tenantA.adminEmail);
    // El colegio ya creó el año siguiente, todavía en CONFIGURACION y sin cursos:
    // elegir «el más reciente» dejaba el paso 5 sin ningún curso que ofrecer.
    const anio2027 = await crearAnioLectivo(tenantA.colegioId, 2027, 'CONFIGURACION');
    try {
      const { body } = await agente.get('/api/matriculas/cursos').expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ id: tenantA.cursoId, anio: 2026 });
    } finally {
      await borrarAnioLectivo(anio2027);
    }
  });

  it('sin año ACTIVO cae al más reciente no cerrado', async () => {
    const agente = await login(tenantA.adminEmail);
    await estadoDeAnio(tenantA.anioLectivoId, 'CONFIGURACION');
    try {
      const { body } = await agente.get('/api/matriculas/cursos').expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ id: tenantA.cursoId, anio: 2026 });
    } finally {
      await estadoDeAnio(tenantA.anioLectivoId, 'ACTIVO');
    }
  });

  it('rechaza matricular en un año cerrado (409)', async () => {
    const agente = await login(tenantA.adminEmail);
    const cerrado = await crearCursoEnAnio(tenantA.colegioId, tenantA.cursoId, 2028, 'CERRADO');
    try {
      const respuesta = await agente
        .post('/api/matriculas')
        .send({ estudianteId: tenantA.estudianteId, cursoId: cerrado.cursoId })
        .expect(409);
      expect(respuesta.body.error.code).toBe('CONFLICT');
      expect(respuesta.body.error.message).toContain('cerrado');
    } finally {
      await borrarAnioLectivo(cerrado.anioId);
    }
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

  it('una página fuera de rango conserva el total real', async () => {
    const agente = await login(tenantA.adminEmail);
    // Con una sola matrícula y limit=1, la página 2 no trae filas: el total
    // tiene que seguir diciendo 1 (antes se leía de la primera fila y daba 0).
    const fuera = await agente
      .get(`/api/matriculas?cursoId=${tenantA.cursoId}&limit=1&page=2`)
      .expect(200);
    expect(fuera.body.data.items).toHaveLength(0);
    expect(fuera.body.data.total).toBe(1);
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

  it('la importación de una fila es atómica: si falla la matrícula, no queda la ficha', async () => {
    const repo = app.get(MatriculasRepository);
    const contexto: TenantContext = { colegioId: tenantA.colegioId, isPlatformAdmin: false };

    // Curso inexistente: la matrícula viola la clave foránea (23503) DESPUÉS de
    // que la transacción ya insertó la ficha, así que el rollback es observable.
    const fallo = await repo
      .matricularDesdeCsv(contexto, {
        documento: tenantA.cuentaSinFichaDocumento,
        cursoId: '00000000-0000-4000-8000-000000000000',
        anioLectivoId: tenantA.anioLectivoId,
        condicion: 'NUEVO',
        fechaMatricula: '2026-02-10',
        fechaNacimiento: '2012-03-04',
      })
      .then(() => null)
      .catch((error: unknown) => error);

    // 23503 = foreign_key_violation (drizzle lo deja en `cause` a veces).
    const codigos = [fallo, (fallo as { cause?: unknown } | null)?.cause].map((posible) =>
      typeof posible === 'object' && posible !== null && 'code' in posible
        ? (posible as { code?: unknown }).code
        : undefined,
    );
    expect(codigos).toContain('23503');

    const [ficha] = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ id: estudiantes.id })
        .from(estudiantes)
        .where(
          and(
            eq(estudiantes.colegioId, tenantA.colegioId),
            eq(estudiantes.usuarioId, tenantA.cuentaSinFichaId),
          ),
        )
        .limit(1),
    );
    expect(ficha).toBeUndefined();
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
            correo: `cuenta.1@${tenantA.codigo}`,
            sede: 'sede principal',
            grado: '6°',
            letra: 'a',
            jornada: 'Mañana',
            fechaNacimiento: '2012-09-30',
            condicion: 'Repitente',
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
          // Fila 7: condición que no existe (el resto de la fila es válido).
          {
            documento: '99999998',
            sede: 'Sede Principal',
            grado: '6',
            letra: 'A',
            jornada: 'MANANA',
            condicion: 'Pepito',
          },
        ],
      })
      .expect(200);

    expect(body.data.creadas).toBe(1);
    expect(body.data.errores).toHaveLength(6);
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
    expect(body.data.errores[5]).toMatchObject({ fila: 7 });
    expect(body.data.errores[5].motivo).toContain('Condición inválida');

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

    // La condición del CSV se respeta: antes toda fila entraba como NUEVO.
    const delCsv = await agente
      .get(`/api/matriculas?anioLectivoId=${tenantA.anioLectivoId}&q=Cuenta`)
      .expect(200);
    expect(delCsv.body.data.items[0]).toMatchObject({ condicion: 'REPITENTE' });
  });

  it('la baja de un año anterior es una corrección: sigue matriculado y el log dice quién la hizo', async () => {
    const agente = await login(tenantA.adminEmail);

    // Un año anterior ya cerrado, con su curso, para el MISMO estudiante.
    const anterior = await withTenant(db, platformCtx, async (tx) => {
      const [grado] = await tx
        .select({ id: grados.id })
        .from(grados)
        .where(eq(grados.colegioId, tenantA.colegioId))
        .limit(1);
      if (grado === undefined) throw new Error('Fixture: grado');
      const [anio] = await tx
        .insert(aniosLectivos)
        .values({
          colegioId: tenantA.colegioId,
          anio: 2025,
          fechaInicio: '2025-02-03',
          fechaFin: '2025-11-28',
          estado: 'CERRADO',
        })
        .returning({ id: aniosLectivos.id });
      if (anio === undefined) throw new Error('Fixture: año anterior');
      const [grupo] = await tx
        .insert(grupos)
        .values({
          colegioId: tenantA.colegioId,
          sedeId: tenantA.sedeId,
          anioLectivoId: anio.id,
          gradoId: grado.id,
          letra: 'A',
          jornada: 'MANANA',
        })
        .returning({ id: grupos.id });
      if (grupo === undefined) throw new Error('Fixture: grupo anterior');
      // La matrícula de 2025 se siembra por SQL: el alta por API ya rechaza los
      // años cerrados (409), y lo que este test ejercita es la BAJA como corrección.
      const [matricula] = await tx
        .insert(matriculas)
        .values({
          colegioId: tenantA.colegioId,
          anioLectivoId: anio.id,
          estudianteId: tenantA.estudianteId,
          grupoId: grupo.id,
          fechaMatricula: '2025-02-10',
          condicion: 'NUEVO',
          estado: 'MATRICULADO',
        })
        .returning({ id: matriculas.id });
      if (matricula === undefined) throw new Error('Fixture: matrícula anterior');
      return { matriculaId: matricula.id };
    });

    // Retirar la de 2025 (año cerrado) se permite: es una corrección.
    await agente.delete(`/api/matriculas/${anterior.matriculaId}`).expect(200);

    // La de 2026 sigue vigente, así que el estudiante NO queda retirado.
    expect(await estadoDeEstudiante(tenantA.colegioId, tenantA.estudianteDocumento)).toBe(
      'MATRICULADO',
    );

    // Y la baja quedó auditada con quién la hizo y por qué.
    const [admin] = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(
          and(eq(usuarios.colegioId, tenantA.colegioId), eq(usuarios.usuario, tenantA.adminEmail)),
        )
        .limit(1),
    );
    const [log] = await withTenant(db, platformCtx, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entidad, 'matriculas'),
            eq(auditLog.entidadId, anterior.matriculaId),
            eq(auditLog.accion, 'UPDATE'),
          ),
        )
        .limit(1),
    );
    expect(log?.usuarioId).toBe(admin?.id);
    expect(JSON.stringify(log?.metadata)).toContain('Corrección');
    expect(JSON.stringify(log?.metadata)).toContain('2025');
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

    // Sin matrículas vigentes, la ficha del estudiante pasa a RETIRADO: antes se
    // quedaba en MATRICULADO sin ninguna matrícula detrás.
    expect(await estadoDeEstudiante(tenantA.colegioId, tenantA.estudianteDocumento)).toBe(
      'RETIRADO',
    );
  });

  it('el reingreso el mismo año reactiva la matrícula retirada en vez de rechazarlo', async () => {
    const agente = await login(tenantA.adminEmail);

    const reingreso = await agente
      .post('/api/matriculas')
      .send({ estudianteId: tenantA.estudianteId, cursoId: tenantA.cursoId })
      .expect(201);

    // Es el MISMO registro: el UNIQUE (año, estudiante) no permite otro.
    expect(reingreso.body.data.id).toBe(matriculaA);

    const listado = await agente.get(`/api/matriculas?cursoId=${tenantA.cursoId}`).expect(200);
    const fila = listado.body.data.items.find((m: { id: string }) => m.id === matriculaA);
    expect(fila?.estado).toBe('MATRICULADO');

    // Y la ficha del estudiante vuelve a MATRICULADO.
    expect(await estadoDeEstudiante(tenantA.colegioId, tenantA.estudianteDocumento)).toBe(
      'MATRICULADO',
    );

    // La auditoría lo registra como reactivación, con el estado del que venía.
    const [log] = await withTenant(db, platformCtx, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entidadId, matriculaA), eq(auditLog.accion, 'CREATE')))
        .orderBy(desc(auditLog.createdAt))
        .limit(1),
    );
    expect(JSON.stringify(log?.metadata)).toContain('Reactivación');
    expect(JSON.stringify(log?.metadata)).toContain('RETIRADO');
  });

  // El esquema admite 500 filas (~150 kb con datos realistas) y el límite por
  // defecto de Express es 100 kb: antes de subirlo, esta petición moría con 500.
  it('un cuerpo de 500 filas de matrícula se parsea (no 413 ni 500)', async () => {
    const filas = Array.from({ length: 500 }, (_, i) => ({
      documento: `10${String(10000000 + i)}`,
      nombres: 'María Fernanda',
      apellidos: 'Gómez Rodríguez',
      correo: `estudiante${i}@ejemplo.edu.co`,
      sede: 'Sede Principal',
      grado: '6°',
      letra: 'A',
      jornada: 'Mañana',
      fechaNacimiento: '2012-04-18',
    }));

    // Sin sesión a propósito: el cuerpo se parsea antes de los guards, así que
    // si el límite siguiera en 100 kb la respuesta sería 413/500, no 401.
    const res = await request(app.getHttpServer()).post('/api/matriculas/importar').send({ filas });
    expect(res.status).toBe(401);
  });

  it('un cuerpo por encima de 1 MB responde 413 con PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/matriculas/importar')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ relleno: 'x'.repeat(1_200_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ success: false, error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('dos cuentas con el mismo documento: sin tipoDocumento no elige, con tipo sí', async () => {
    const repo = app.get(MatriculasRepository);
    const contexto: TenantContext = { colegioId: tenantA.colegioId, isPlatformAdmin: false };
    // Documento repetido con dos tipos distintos: el UNIQUE es (colegio, tipo, número).
    const documento = `77${sufijo.slice(-6)}`;
    const hash = await bcrypt.hash(PASSWORD, 4);

    const [rolEstudiante] = await withTenant(db, platformCtx, (tx) =>
      tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.colegioId, tenantA.colegioId), eq(roles.tipoPersona, 'ESTUDIANTE')))
        .limit(1),
    );
    if (rolEstudiante === undefined) throw new Error('Fixture: rol estudiante');

    const creados = await withTenant(db, platformCtx, (tx) =>
      tx
        .insert(usuarios)
        .values(
          (
            [
              { tipo: 'TI', nombres: 'Duplicado', apellidos: 'Tarjeta' },
              { tipo: 'CC', nombres: 'Duplicado', apellidos: 'Cedula' },
            ] as const
          ).map(({ tipo, nombres, apellidos }) => ({
            colegioId: tenantA.colegioId,
            usuario: `dup.${tipo.toLowerCase()}@${tenantA.codigo}`,
            passwordHash: hash,
            nombres,
            apellidos,
            tipoDocumento: tipo,
            numeroDocumento: documento,
            rolId: rolEstudiante.id,
            debeCambiarPassword: false,
          })),
        )
        .returning({ id: usuarios.id, usuario: usuarios.usuario }),
    );
    const cc = creados.find((u) => u.usuario === `dup.cc@${tenantA.codigo}`);
    if (cc === undefined) throw new Error('Fixture: cuenta CC');

    try {
      const base = {
        documento,
        cursoId: tenantA.cursoId,
        anioLectivoId: tenantA.anioLectivoId,
        condicion: 'NUEVO' as const,
        fechaMatricula: '2026-02-10',
        fechaNacimiento: '2012-01-15',
      };

      // Sin tipo: hay dos cuentas → no elige ninguna.
      await expect(repo.matricularDesdeCsv(contexto, base)).resolves.toEqual({
        estado: 'documento-ambiguo',
      });

      // Con tipo: matricula la CC, no la TI.
      const resultado = await repo.matricularDesdeCsv(contexto, {
        ...base,
        tipoDocumento: 'CC',
      });
      expect(resultado.estado).toBe('creada');
      if (resultado.estado !== 'creada') throw new Error('Se esperaba creada');

      const [fila] = await withTenant(db, platformCtx, (tx) =>
        tx
          .select({ usuarioId: estudiantes.usuarioId })
          .from(matriculas)
          .innerJoin(estudiantes, eq(estudiantes.id, matriculas.estudianteId))
          .where(eq(matriculas.id, resultado.matriculaId))
          .limit(1),
      );
      expect(fila?.usuarioId).toBe(cc.id);
    } finally {
      // Solo lo que creó este test: no mover los contadores que otros miden.
      const ids = creados.map((u) => u.id);
      await withTenant(db, platformCtx, async (tx) => {
        const fichas = await tx
          .select({ id: estudiantes.id })
          .from(estudiantes)
          .where(inArray(estudiantes.usuarioId, ids));
        if (fichas.length > 0) {
          await tx.delete(matriculas).where(
            inArray(
              matriculas.estudianteId,
              fichas.map((f) => f.id),
            ),
          );
        }
        await tx.delete(estudiantes).where(inArray(estudiantes.usuarioId, ids));
        await tx.delete(usuarios).where(inArray(usuarios.id, ids));
      });
    }
  });
});
