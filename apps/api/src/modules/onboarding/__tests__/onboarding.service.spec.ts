/**
 * OnboardingService — reglas del paso 1 que no se ven en el e2e.
 *
 *  - La caché del contexto público se invalida con las llaves de ANTES y de
 *    DESPUÉS del cambio (ADR-005): el nombre y el color se pintan en el login.
 *  - El dominio de correo no viaja al repositorio: solo se fija la primera vez,
 *    con el dominio del correo del admin.
 *  - La consulta por código DANE es exclusiva del admin.
 */
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingService, type ActorOnboarding } from '../onboarding.service';
import type { DaneService } from '../dane.service';
import type { FotoOnboarding, OnboardingRepository } from '../onboarding.repository';
import type { AuthService } from '../../auth/auth.service';
import type { AuditService } from '../../../shared/audit.service';

const ACTOR: ActorOnboarding = {
  colegioId: 'colegio-1',
  usuarioId: 'usuario-1',
  esAdmin: true,
};

/** Cuerpo del error HTTP lanzado por el servicio (estrecha la unión ApiResponse). */
function cuerpoDe(error: unknown): { error: { code: string; message: string } } {
  const cuerpo = (error as HttpException).getResponse() as {
    success: boolean;
    error?: { code: string; message: string };
  };
  if (cuerpo.error === undefined)
    throw new Error('Se esperaba un error y llegó una respuesta correcta');
  return { error: cuerpo.error };
}

/** Año en curso: el schema solo acepta el anterior, el actual y el próximo. */
const ANIO = new Date().getFullYear();

const DATOS = {
  nombre: 'I.E.T.D. Juana Arias de Benavides',
  nombreOficial: 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
  codigoDane: '147555000295',
  municipio: 'Plato',
  departamento: 'Magdalena',
  email: 'rectoria@juanaarias.edu.co',
  calendario: 'A' as const,
  anioLectivo: ANIO,
  periodos: [
    { numero: 1, nombre: 'Período 1', fechaInicio: `${ANIO}-02-02`, fechaFin: `${ANIO}-04-24` },
    { numero: 2, nombre: 'Período 2', fechaInicio: `${ANIO}-04-28`, fechaFin: `${ANIO}-07-03` },
  ],
};

/** Foto mínima que `estado()` necesita para armar el contrato. */
function foto(): FotoOnboarding {
  return {
    colegio: {
      id: 'colegio-1',
      nombre: 'I.E.T.D. Juana Arias de Benavides',
      nombreOficial: 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
      nit: null,
      codigoDane: '147555000295',
      municipio: 'Plato',
      departamento: 'Magdalena',
      direccion: null,
      telefono: null,
      email: 'rectoria@juanaarias.edu.co',
      calendario: 'A',
      jornadasMen: null,
      onboardingPaso: 2,
      onboardingCompletadoEn: null,
    },
    sedes: [],
    anio: null,
    periodos: [],
    conteos: { grados: 0, cursos: 0, personal: 1, estudiantes: 0, matriculados: 0, roles: 5 },
  };
}

function montar() {
  const repo = {
    contextoPublico: vi.fn(),
    guardarColegio: vi.fn().mockResolvedValue(undefined),
    eliminarSede: vi.fn(),
    foto: vi.fn().mockResolvedValue(foto()),
  };
  const audit = { registrar: vi.fn().mockResolvedValue(undefined) };
  const auth = { invalidarContextoColegio: vi.fn() };
  const dane = { buscar: vi.fn() };

  const servicio = new OnboardingService(
    repo as unknown as OnboardingRepository,
    audit as unknown as AuditService,
    auth as unknown as AuthService,
    dane as unknown as DaneService,
  );
  return { servicio, repo, audit, auth, dane };
}

describe('OnboardingService · paso 1', () => {
  it('invalida el contexto público del colegio (la llave es su código)', async () => {
    const { servicio, repo, auth } = montar();
    repo.contextoPublico.mockResolvedValue({ codigo: 'juanaArias' });

    await servicio.guardarColegio(ACTOR, DATOS);

    expect(auth.invalidarContextoColegio).toHaveBeenCalledWith({ codigo: 'juanaArias' });
  });

  it('no manda ningún dominio al repositorio: el código es el identificador', async () => {
    const { servicio, repo } = montar();
    repo.contextoPublico.mockResolvedValue({ codigo: 'juanaArias' });

    await servicio.guardarColegio(ACTOR, DATOS);

    const enviado = repo.guardarColegio.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(enviado).not.toHaveProperty('dominioEmail');
    expect(enviado).not.toHaveProperty('dominioColegio');
  });

  it('pasa el nombre oficial al repositorio sin tocarlo', async () => {
    const { servicio, repo } = montar();
    repo.contextoPublico.mockResolvedValue({ codigo: 'juanaArias' });
    const nombreOficial = 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES';

    await servicio.guardarColegio(ACTOR, { ...DATOS, nombreOficial });

    const enviado = repo.guardarColegio.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(enviado['nombreOficial']).toBe(nombreOficial);
  });

  it('traduce el choque de unique a 409 sin mencionar el dominio como editable', async () => {
    const { servicio, repo } = montar();
    repo.contextoPublico.mockResolvedValue({ codigo: 'juanaArias' });
    repo.guardarColegio.mockRejectedValue({ cause: { code: '23505' } });

    const error = await servicio.guardarColegio(ACTOR, DATOS).catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(409);
  });
});

describe('OnboardingService · eliminar sede', () => {
  it('borra la sede y deja rastro en la auditoría', async () => {
    const { servicio, repo, audit } = montar();
    repo.eliminarSede.mockResolvedValue('borrada');

    await servicio.eliminarSede(ACTOR, 'sede-2');

    expect(repo.eliminarSede).toHaveBeenCalledWith(expect.anything(), 'sede-2');
    expect(audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'DELETE', entidad: 'sedes', entidadId: 'sede-2' }),
    );
  });

  it('no deja el colegio sin sedes (409)', async () => {
    const { servicio, repo } = montar();
    repo.eliminarSede.mockResolvedValue('ultima');

    const error = await servicio.eliminarSede(ACTOR, 'sede-1').catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(409);
    expect(cuerpoDe(error).error.message).toMatch(/al menos una sede/i);
  });

  it('no borra una sede que ya tiene cursos (409)', async () => {
    const { servicio, repo } = montar();
    repo.eliminarSede.mockResolvedValue('con-cursos');

    const error = await servicio.eliminarSede(ACTOR, 'sede-1').catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(409);
    expect(cuerpoDe(error).error.message).toMatch(/cursos/i);
  });

  it('404 si la sede no existe', async () => {
    const { servicio, repo } = montar();
    repo.eliminarSede.mockResolvedValue('no-existe');

    const error = await servicio.eliminarSede(ACTOR, 'sede-9').catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(404);
  });

  it('403 a quien no es admin, sin tocar el repositorio', async () => {
    const { servicio, repo } = montar();

    const error = await servicio
      .eliminarSede({ ...ACTOR, esAdmin: false }, 'sede-2')
      .catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(403);
    expect(repo.eliminarSede).not.toHaveBeenCalled();
  });
});

describe('OnboardingService · consulta DANE', () => {
  it('delega en DaneService cuando el actor es admin', async () => {
    const { servicio, dane } = montar();
    dane.buscar.mockResolvedValue({ codigoDane: '147555000295', nombre: 'I.E.T.D.' });

    const datos = await servicio.buscarDane(ACTOR, '147555000295');

    expect(dane.buscar).toHaveBeenCalledWith('147555000295');
    expect(datos).toMatchObject({ codigoDane: '147555000295' });
  });

  it('rechaza con 403 a quien no es admin y no consulta el portal', async () => {
    const { servicio, dane } = montar();

    const error = await servicio
      .buscarDane({ ...ACTOR, esAdmin: false }, '147555000295')
      .catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(403);
    expect(dane.buscar).not.toHaveBeenCalled();
  });
});
