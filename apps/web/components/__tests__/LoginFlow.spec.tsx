/**
 * Tests del LoginFlow unificado — la API y next/navigation van mockeados (el
 * contrato real lo cubren los e2e de la API). Se valida la máquina de estados,
 * la resolución del colegio por dominio del correo, la caché (TanStack Query)
 * y su invalidación explícita al cambiar datos del colegio.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('@/lib/api', () => {
  class ApiErrorMock extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError: ApiErrorMock,
    getContextoPorDominio: vi.fn(),
    iniciarSesion: vi.fn(),
  };
});

import { ApiError, getContextoPorDominio, iniciarSesion } from '@/lib/api';
import { LoginFlow } from '../login/LoginFlow';
import type { ContextoConSede } from '@/lib/api';

const contexto: ContextoConSede = {
  nombre: 'Colegio Norte',
  codigoDane: '105001001234',
  logoUrl: null,
  primaryColor: null,
  municipio: 'Plato',
  departamento: 'Magdalena',
  estado: 'ACTIVO',
  subdominio: 'colegio-norte',
};

const EMAIL = 'maria@colegio-norte.edu.co';

function nuevoCliente(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Render del flujo con un QueryClient de prueba (compartible entre renders). */
function renderFlow(cliente?: QueryClient): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={cliente ?? nuevoCliente()}>
      <LoginFlow />
    </QueryClientProvider>,
  );
}

function loginOk(debeCambiarPassword: boolean) {
  return {
    usuario: {
      id: 'u1',
      email: EMAIL,
      nombres: 'María',
      apellidos: 'López',
      esAdmin: false,
      debeCambiarPassword,
    },
    colegio: { id: 'c1', nombre: 'Colegio Norte', codigoDane: '105001001234', primaryColor: null },
    sessionToken: 'token-de-prueba',
  };
}

/** Paso 1: escribe el correo y espera a que el colegio quede resuelto. */
async function identificar(email: string): Promise<void> {
  const campo = screen.getByLabelText(/^correo electrónico/i);
  // Limpiar primero: al volver del paso 2 el campo conserva el correo anterior.
  await userEvent.clear(campo);
  await userEvent.type(campo, email);
  await userEvent.click(screen.getByRole('button', { name: /continuar|buscando tu colegio/i }));
  await screen.findByText(/estás entrando como/i);
}

describe('LoginFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getContextoPorDominio).mockResolvedValue(contexto);
    vi.mocked(iniciarSesion).mockResolvedValue(loginOk(false));
  });

  it('resuelve el colegio por el dominio del correo antes de pedir la contraseña', async () => {
    renderFlow();
    expect(screen.getByText('EduPlatform')).toBeInTheDocument();

    await identificar(EMAIL);

    expect(vi.mocked(getContextoPorDominio)).toHaveBeenCalledWith('colegio-norte.edu.co');
    expect(screen.getByText('Colegio Norte')).toBeInTheDocument();
    expect(screen.getByText('DANE 105001001234')).toBeInTheDocument();
  });

  it('el paso 1 valida el correo antes de consultar', async () => {
    renderFlow();
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByText('Ingresa tu correo institucional.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^correo electrónico/i), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByText('Formato de correo inválido.')).toBeInTheDocument();
    expect(vi.mocked(getContextoPorDominio)).not.toHaveBeenCalled();
  });

  it('dominio sin colegio registrado (404) → error en el campo, sin avanzar', async () => {
    vi.mocked(getContextoPorDominio).mockRejectedValue(
      new ApiError(
        404,
        'NOT_FOUND',
        'No encontramos un colegio registrado con ese dominio de correo',
      ),
    );
    renderFlow();
    await userEvent.type(screen.getByLabelText(/^correo electrónico/i), 'alguien@desconocido.test');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(
      await screen.findByText('Este correo no pertenece a ningún colegio registrado.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/estás entrando como/i)).not.toBeInTheDocument();
  });

  it('el formulario de contraseña incluye un campo de usuario oculto (gestores de contraseñas)', async () => {
    const { container } = renderFlow();
    await identificar(EMAIL);

    // Chrome/Dashlane exigen el usuario en el mismo <form> que la contraseña.
    const usuario = container.querySelector<HTMLInputElement>('input[name="username"]');
    expect(usuario).not.toBeNull();
    expect(usuario?.value).toBe(EMAIL);
    expect(usuario?.hidden).toBe(true);
  });

  it('login exitoso → redirige a /dashboard', async () => {
    renderFlow();
    await identificar(EMAIL);

    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'ClaveSegura123');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(vi.mocked(iniciarSesion)).toHaveBeenCalledWith({
      email: EMAIL,
      password: 'ClaveSegura123',
      rememberMe: false,
    });
  });

  it('primer login (debeCambiarPassword) → redirige a /cambiar-password', async () => {
    vi.mocked(iniciarSesion).mockResolvedValue(loginOk(true));
    renderFlow();
    await identificar(EMAIL);

    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'Temporal123');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/cambiar-password'));
  });

  it('credenciales inválidas → error en el campo, sin navegar', async () => {
    vi.mocked(iniciarSesion).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos'),
    );
    renderFlow();
    await identificar(EMAIL);

    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'MalaClave999');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('contraseña de menos de 8 caracteres → valida en el cliente (sin 400 de la API)', async () => {
    renderFlow();
    await identificar(EMAIL);

    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'corta');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(
      await screen.findByText('La contraseña debe tener al menos 8 caracteres.'),
    ).toBeInTheDocument();
    expect(vi.mocked(iniciarSesion)).not.toHaveBeenCalled();
  });

  it('cuenta bloqueada (423) → muestra la tarjeta de bloqueo', async () => {
    vi.mocked(iniciarSesion).mockRejectedValue(
      new ApiError(423, 'ACCOUNT_LOCKED', 'Cuenta bloqueada temporalmente'),
    );
    renderFlow();
    await identificar(EMAIL);

    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'OtraClave999');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByText('Cuenta bloqueada')).toBeInTheDocument();
    expect(screen.getByText(/15 minutos/i)).toBeInTheDocument();
  });

  it('el aviso de "¿Olvidaste?" desaparece al volver a cambiar el correo', async () => {
    renderFlow();
    await identificar(EMAIL);

    await userEvent.click(screen.getByRole('button', { name: /¿olvidaste\?/i }));
    expect(await screen.findByText(/Para restablecer tu contraseña/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /cambiar correo/i }));
    expect(screen.queryByText(/Para restablecer tu contraseña/i)).not.toBeInTheDocument();
    expect(await screen.findByText('Iniciar sesión')).toBeInTheDocument();
  });

  it('usa la caché: identificar dos veces el mismo dominio consulta una sola vez', async () => {
    const cliente = nuevoCliente();
    const primera = renderFlow(cliente);
    await identificar(EMAIL);
    primera.unmount();

    renderFlow(cliente);
    await identificar(EMAIL);
    expect(vi.mocked(getContextoPorDominio)).toHaveBeenCalledTimes(1);
  });

  it('al invalidar el contexto se vuelve a consultar (cambio de color del colegio)', async () => {
    const cliente = nuevoCliente();
    renderFlow(cliente);
    await identificar(EMAIL);
    expect(vi.mocked(getContextoPorDominio)).toHaveBeenCalledTimes(1);

    // El colegio cambió su color: el módulo de colegios invalida la caché…
    vi.mocked(getContextoPorDominio).mockResolvedValue({ ...contexto, primaryColor: '#a3331a' });
    await act(async () => {
      await cliente.invalidateQueries({ queryKey: ['contexto-colegio'] });
    });

    // …y la siguiente identificación ya trae el valor nuevo, sin esperar TTL.
    await userEvent.click(screen.getByRole('button', { name: /cambiar correo/i }));
    await identificar(EMAIL);
    expect(vi.mocked(getContextoPorDominio)).toHaveBeenCalledTimes(2);
  });
});
