/**
 * Tests de la pantalla de cambio de contraseña obligatorio: lo que se agrega
 * aquí es el ojo de mostrar/ocultar en los DOS campos. La sesión y la API van
 * mockeadas; rellenar y guardar lo cubren los e2e de la API.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@eduplatform/types';

const { mockReplace, mockCambiarPassword } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockCambiarPassword: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockReplace }),
}));

vi.mock('@/lib/api', () => ({
  cambiarPassword: mockCambiarPassword,
  ApiError: class ApiErrorMock extends Error {},
}));

const SESION: MeResponse = {
  tipo: 'colegio',
  usuario: {
    id: 'u-1',
    usuario: 'rector@colegio',
    nombres: 'Ana',
    apellidos: 'Pérez',
    esAdmin: true,
    debeCambiarPassword: true,
  },
  colegio: {
    id: 'c-1',
    nombre: 'Colegio de Prueba',
    codigoDane: '112233445566',
    primaryColor: '#0856cf',
  },
  permisos: [],
  esAdmin: true,
};

vi.mock('@/hooks/useSesion', () => ({
  SESION_KEY: ['sesion'],
  useSesion: () => ({ data: SESION, isError: false }),
}));

import CambiarPasswordPage from '../page';

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <CambiarPasswordPage />
    </QueryClientProvider>,
  );
}

describe('CambiarPasswordPage — mostrar/ocultar contraseñas', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockCambiarPassword.mockReset();
  });

  it('los dos campos empiezan ocultos y cada uno tiene su propio botón', () => {
    renderizar();

    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mostrar confirmación de contraseña' }),
    ).toBeInTheDocument();
  });

  it('muestra la contraseña nueva sin enviar el formulario y conserva lo escrito', async () => {
    renderizar();
    const campo = screen.getByLabelText('Nueva contraseña');

    await userEvent.type(campo, 'Secreta1');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));

    expect(campo).toHaveAttribute('type', 'text');
    expect(campo).toHaveValue('Secreta1');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toBeInTheDocument();
    expect(mockCambiarPassword).not.toHaveBeenCalled();
  });

  it('el ojo de confirmación es independiente del de la contraseña nueva', async () => {
    renderizar();
    const nueva = screen.getByLabelText('Nueva contraseña');
    const confirmar = screen.getByLabelText('Confirmar contraseña');

    await userEvent.click(
      screen.getByRole('button', { name: 'Mostrar confirmación de contraseña' }),
    );

    expect(confirmar).toHaveAttribute('type', 'text');
    expect(nueva).toHaveAttribute('type', 'password');
  });

  it('vuelve a ocultar al pulsar de nuevo', async () => {
    renderizar();
    const campo = screen.getByLabelText('Confirmar contraseña');

    await userEvent.click(
      screen.getByRole('button', { name: 'Mostrar confirmación de contraseña' }),
    );
    expect(campo).toHaveAttribute('type', 'text');

    await userEvent.click(
      screen.getByRole('button', { name: 'Ocultar confirmación de contraseña' }),
    );
    expect(campo).toHaveAttribute('type', 'password');
  });
});
