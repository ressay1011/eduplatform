/**
 * Guardia del área privada: onboarding pendiente, contraseña temporal y 401.
 *
 * Cubre el caso que se escapaba: `/dashboard` tiene su propia maqueta (no usa
 * `DashboardShell`), así que el admin de un colegio sin configurar aterrizaba
 * en el panel en vez de en el wizard.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoOnboarding, MeResponse } from '@eduplatform/types';

const { mockReplace } = vi.hoisted(() => ({ mockReplace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

vi.mock('@/lib/api', () => {
  class ApiErrorMock extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ApiError: ApiErrorMock,
    getSesion: vi.fn(),
    getOnboarding: vi.fn(),
    cerrarSesion: vi.fn(),
  };
});

import { ApiError, getOnboarding, getSesion } from '@/lib/api';
import { GuardiaAcceso } from '../GuardiaAcceso';

function sesion(esAdmin: boolean, debeCambiarPassword = false): MeResponse {
  return {
    tipo: 'colegio',
    usuario: {
      id: 'u1',
      usuario: 'admin@juanaarias',
      nombres: 'Yasser',
      apellidos: 'Ariza',
      esAdmin,
      debeCambiarPassword,
    },
    colegio: {
      id: 'c1',
      nombre: 'I.E.T.D. Juana Arias',
      codigoDane: '105001000123',
      primaryColor: null,
    },
    permisos: [],
    esAdmin,
  };
}

function onboarding(completado: boolean): EstadoOnboarding {
  return {
    completado,
    paso: completado ? 6 : 1,
    colegio: {
      id: 'c1',
      nombre: '',
      nombreOficial: null,
      nit: null,
      codigoDane: '',
      subdominio: 'juanaarias',
      dominioEmail: 'juanaarias.edu.co',
      municipio: '',
      departamento: '',
      direccion: null,
      telefono: null,
      email: '',
      calendario: 'A',
    },
    sedes: [],
    anioLectivo: null,
    periodos: [],
    estructura: { grados: 0, cursos: 0 },
    personal: { total: 1 },
    estudiantes: { total: 0, matriculados: 0 },
    checklist: [],
  };
}

function renderGuardia() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <GuardiaAcceso>
        <p>contenido privado</p>
      </GuardiaAcceso>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GuardiaAcceso', () => {
  it('manda al wizard al admin con el onboarding pendiente y no pinta el panel', async () => {
    vi.mocked(getSesion).mockResolvedValue(sesion(true));
    vi.mocked(getOnboarding).mockResolvedValue(onboarding(false));

    renderGuardia();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding'));
    expect(screen.queryByText('contenido privado')).toBeNull();
  });

  it('deja pasar al admin cuando el colegio ya está configurado', async () => {
    vi.mocked(getSesion).mockResolvedValue(sesion(true));
    vi.mocked(getOnboarding).mockResolvedValue(onboarding(true));

    renderGuardia();

    expect(await screen.findByText('contenido privado')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('fuerza el cambio de contraseña temporal antes que nada', async () => {
    vi.mocked(getSesion).mockResolvedValue(sesion(true, true));
    vi.mocked(getOnboarding).mockResolvedValue(onboarding(false));

    renderGuardia();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cambiar-password'));
    expect(screen.queryByText('contenido privado')).toBeNull();
  });

  it('no consulta el onboarding para el personal que no es admin', async () => {
    vi.mocked(getSesion).mockResolvedValue(sesion(false));

    renderGuardia();

    expect(await screen.findByText('contenido privado')).toBeInTheDocument();
    expect(getOnboarding).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('manda al login si la sesión caducó', async () => {
    vi.mocked(getSesion).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sesión requerida'));

    renderGuardia();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('contenido privado')).toBeNull();
  });
});
