/**
 * OnboardingService — reglas del paso 1 que no se ven en el e2e.
 *
 *  - La caché del contexto público se invalida con las llaves de ANTES y de
 *    DESPUÉS del cambio (ADR-005): el nombre y el subdominio se pintan en el login.
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

const DATOS = {
  nombre: 'I.E.T.D. Juana Arias de Benavides',
  codigoDane: '147555000295',
  subdominio: 'juana-arias',
  municipio: 'Plato',
  departamento: 'Magdalena',
  email: 'rectoria@juanaarias.edu.co',
  calendario: 'A' as const,
  anioLectivo: 2026,
  periodos: [
    { numero: 1, nombre: 'Período 1', fechaInicio: '2026-02-02', fechaFin: '2026-04-24' },
    { numero: 2, nombre: 'Período 2', fechaInicio: '2026-04-28', fechaFin: '2026-07-03' },
  ],
};

/** Foto mínima que `estado()` necesita para armar el contrato. */
function foto(subdominio: string): FotoOnboarding {
  return {
    colegio: {
      id: 'colegio-1',
      nombre: 'I.E.T.D. Juana Arias de Benavides',
      nombreOficial: 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
      nit: null,
      codigoDane: '147555000295',
      subdominio,
      municipio: 'Plato',
      departamento: 'Magdalena',
      direccion: null,
      telefono: null,
      email: 'rectoria@juanaarias.edu.co',
      calendario: 'A',
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
    foto: vi.fn().mockResolvedValue(foto('juana-arias')),
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
  it('invalida el contexto público con las llaves de antes y de después', async () => {
    const { servicio, repo, auth } = montar();
    repo.contextoPublico
      .mockResolvedValueOnce({ subdominio: 'ie-demo', dominioEmail: 'juanaarias.edu.co' })
      .mockResolvedValueOnce({ subdominio: 'juana-arias', dominioEmail: 'juanaarias.edu.co' });

    await servicio.guardarColegio(ACTOR, DATOS);

    expect(auth.invalidarContextoColegio).toHaveBeenCalledTimes(2);
    expect(auth.invalidarContextoColegio).toHaveBeenNthCalledWith(1, {
      subdominio: 'ie-demo',
      dominioEmail: 'juanaarias.edu.co',
    });
    expect(auth.invalidarContextoColegio).toHaveBeenNthCalledWith(2, {
      subdominio: 'juana-arias',
      dominioEmail: 'juanaarias.edu.co',
    });
  });

  it('no manda ningún dominio al repositorio: el subdominio es el único identificador', async () => {
    const { servicio, repo } = montar();
    repo.contextoPublico.mockResolvedValue({ subdominio: 'juana-arias', dominioEmail: null });

    await servicio.guardarColegio(ACTOR, DATOS);

    const enviado = repo.guardarColegio.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(enviado).not.toHaveProperty('dominioEmail');
    expect(enviado).not.toHaveProperty('dominioColegio');
  });

  it('pasa el nombre oficial al repositorio sin tocarlo', async () => {
    const { servicio, repo } = montar();
    repo.contextoPublico.mockResolvedValue({ subdominio: 'juana-arias', dominioEmail: null });
    const nombreOficial = 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES';

    await servicio.guardarColegio(ACTOR, { ...DATOS, nombreOficial });

    const enviado = repo.guardarColegio.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(enviado['nombreOficial']).toBe(nombreOficial);
  });

  it('traduce el choque de unique a 409 sin mencionar el dominio como editable', async () => {
    const { servicio, repo } = montar();
    repo.contextoPublico.mockResolvedValue({ subdominio: 'juana-arias', dominioEmail: null });
    repo.guardarColegio.mockRejectedValue({ cause: { code: '23505' } });

    const error = await servicio.guardarColegio(ACTOR, DATOS).catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(409);
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
