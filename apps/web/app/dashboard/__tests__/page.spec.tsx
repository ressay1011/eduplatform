/**
 * Dashboard del colegio — marco y saludo.
 *
 * Se pinta con una sesión real para cubrir el saludo corto (`nombreCorto`) y
 * las iniciales del avatar, que es la lógica que cambió al admitir usuarios
 * creados solo con credencial (sin nombres ni apellidos). Los indicadores de
 * la página son mock, así que la prueba se queda en el marco y el saludo.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@eduplatform/types';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('@/lib/api', () => ({
  getSesion: vi.fn(),
  getOnboarding: vi.fn(),
  cerrarSesion: vi.fn(),
}));

import { getOnboarding, getSesion } from '@/lib/api';
import DashboardPage from '../page';

const sesion: MeResponse = {
  tipo: 'colegio',
  usuario: {
    id: 'u1',
    usuario: 'admin@juanaarias',
    nombres: 'Yasser Daniel',
    apellidos: 'Ariza Barrios',
    esAdmin: true,
    debeCambiarPassword: false,
  },
  colegio: {
    id: 'c1',
    nombre: 'I.E.T.D. Juana Arias',
    codigoDane: '147555000295',
    primaryColor: null,
  },
  permisos: [],
  esAdmin: true,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

describe('Dashboard del colegio', () => {
  beforeEach(() => {
    vi.mocked(getSesion).mockResolvedValue(sesion);
    vi.mocked(getOnboarding).mockResolvedValue({
      completado: false,
      paso: 1,
      colegio: {
        id: 'c1',
        nombre: 'I.E.T.D. Juana Arias',
        nombreOficial: null,
        nit: null,
        codigoDane: '147555000295',
        subdominio: 'juanaarias',
        municipio: '',
        departamento: '',
        direccion: null,
        telefono: null,
        email: '',
        calendario: 'A',
        sector: null,
        zona: null,
        niveles: [],
        jornadas: [],
        modelosEducativos: [],
        idiomas: [],
        capacidadesExcepcionales: [],
        discapacidades: [],
        etnias: [],
        poblaciones: [],
      },
      pasos: [],
      resumen: {
        sedes: 0,
        grados: 0,
        cursos: 0,
        usuarios: 1,
        estudiantes: 0,
        matriculas: 0,
      },
    } as never);
  });

  it('pinta el saludo con el nombre corto del usuario de la sesión', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Yasser B.')).toBeDefined();
    });
    expect(screen.getByText('YD')).toBeDefined();
  });

  it('sin nombres personales cae al nombre de usuario', async () => {
    vi.mocked(getSesion).mockResolvedValue({
      ...sesion,
      usuario: { ...sesion.usuario, nombres: '', apellidos: '' },
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('admin@juanaarias')).toBeDefined();
    });
  });
});
