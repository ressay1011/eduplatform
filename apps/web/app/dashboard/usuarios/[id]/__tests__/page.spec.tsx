/**
 * /dashboard/usuarios/[id] — detalle y edición de un usuario.
 *
 * Cubre el prellenado del formulario cuando el usuario NO tiene tipo de
 * documento (los usuarios pueden crearse solo con credencial): el campo debe
 * caer en «CC» en vez de quedar vacío. Es la rama `?? 'CC'` del efecto de
 * inicialización.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse, UsuarioListado } from '@eduplatform/types';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useParams: () => ({ id: 'u1' }),
}));

vi.mock('@/hooks/useSesion', () => ({
  SESION_KEY: ['sesion'],
  useSesion: () => ({ data: sesion }),
}));

vi.mock('@/hooks/useUsuarios', () => ({
  useUsuario: () => ({ data: usuario, isLoading: false, isError: false, error: null }),
  useCatalogoPermisos: () => ({ data: [], isLoading: false }),
  useActualizarUsuario: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEstablecerPermisos: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetearPassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
  return { ApiError: ApiErrorMock };
});

import EditarUsuarioPage from '../page';

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

const usuario: UsuarioListado = {
  id: 'u1',
  nombres: 'Docente',
  apellidos: 'Pendiente',
  usuario: 'docente@juanaarias',
  tipoDocumento: null,
  numeroDocumento: '',
  esAdmin: false,
  activo: true,
  debeCambiarPassword: true,
  ultimoAcceso: null,
  permisos: [],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditarUsuarioPage />
    </QueryClientProvider>,
  );
}

describe('Editar usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sin tipo de documento prellena «CC» y el nombre de usuario', async () => {
    renderPage();

    await waitFor(() => {
      const select = document.getElementById('tipo-documento') as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      expect(select?.value).toBe('CC');
    });

    expect((screen.getByDisplayValue('docente@juanaarias') as HTMLInputElement).value).toBe(
      'docente@juanaarias',
    );
  });
});
