/**
 * /dashboard/usuarios/nuevo — alta de personal.
 *
 * Lo que se vigila aquí: el formulario valida con el MISMO esquema que la API,
 * cargado bajo demanda dentro del submit. Si alguien vuelve a escribir las
 * reglas a mano, estos casos siguen pasando pero el mensaje deja de venir del
 * esquema; el que lo delataría es el de documento corto (el esquema exige 4).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@eduplatform/types';

const { mockCrear } = vi.hoisted(() => ({ mockCrear: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/hooks/useSesion', () => ({
  SESION_KEY: ['sesion'],
  useSesion: () => ({ data: sesion }),
}));

vi.mock('@/hooks/useUsuarios', () => ({
  useCatalogoPermisos: () => ({ data: [], isLoading: false }),
  useCrearUsuario: () => ({ mutate: mockCrear, isPending: false }),
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

import NuevoUsuarioPage from '../page';

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

function renderPagina(): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <NuevoUsuarioPage />
    </QueryClientProvider>,
  );
}

describe('alta de usuario · validación con el esquema de la API', () => {
  beforeEach(() => {
    mockCrear.mockClear();
  });

  it('sin datos no envía y enseña el mensaje del esquema', async () => {
    renderPagina();

    await userEvent.click(await screen.findByRole('button', { name: /crear usuario/i }));

    expect(await screen.findByText('Mínimo 2 caracteres')).toBeInTheDocument();
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('con el documento demasiado corto no envía (regla que solo tiene el esquema)', async () => {
    renderPagina();

    await userEvent.type(await screen.findByLabelText(/^nombres/i), 'María');
    await userEvent.type(screen.getByLabelText(/^apellidos/i), 'Gómez Ruiz');
    await userEvent.type(screen.getByLabelText(/^nombre de usuario/i), 'maria.gomez');
    await userEvent.type(screen.getByLabelText(/^número de documento/i), '12');
    await userEvent.click(screen.getByRole('button', { name: /crear usuario/i }));

    expect(await screen.findByText('Mínimo 4 caracteres')).toBeInTheDocument();
    expect(mockCrear).not.toHaveBeenCalled();
  });
});
