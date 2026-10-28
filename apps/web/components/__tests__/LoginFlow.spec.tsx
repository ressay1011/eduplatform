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

vi.mock('@/lib/subdominio', async (original) => {
  const mod = await original<typeof import('@/lib/subdominio')>();
  return { ...mod, subdominioActual: vi.fn(() => null) };
});

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
    getContextoColegio: vi.fn(),
    iniciarSesion: vi.fn(),
  };
});

import { ApiError, getContextoColegio, iniciarSesion } from '@/lib/api';
import { subdominioActual } from '@/lib/subdominio';
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

// Usuario de prueba con dominio heredado: el paso 1 sin subdominio lo resuelve.
const EMAIL = 'maria@colegio-norte';

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
      usuario: EMAIL,
      nombres: 'María',
      apellidos: 'López',
      esAdmin: false,
      debeCambiarPassword,
    },
    colegio: { id: 'c1', nombre: 'Colegio Norte', codigoDane: '105001001234', primaryColor: null },
    sessionToken: 'token-de-prueba',
  };
}

/** Paso 1: escribe el usuario y espera a que el colegio quede resuelto. */
async function identificar(valor: string): Promise<void> {
  const campo = screen.getByLabelText(/^nombre de usuario/i);
  // Limpiar primero: al volver del paso 2 el campo conserva el valor anterior.
  await userEvent.clear(campo);
  await userEvent.type(campo, valor);
  await userEvent.click(screen.getByRole('button', { name: /continuar|buscando tu colegio/i }));
  await screen.findByText(/estás entrando como/i);
}

describe('LoginFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subdominioActual).mockReturnValue(null);
    vi.mocked(getContextoColegio).mockResolvedValue(contexto);
    vi.mocked(iniciarSesion).mockResolvedValue(loginOk(false));
  });

  it('sin subdominio en la URL resuelve el colegio por el sufijo del usuario', async () => {
    renderFlow();
    expect(screen.getByText('EduPlatform')).toBeInTheDocument();

    await identificar(EMAIL);

    expect(vi.mocked(getContextoColegio)).toHaveBeenCalledWith('colegio-norte');
    expect(screen.getByText('Colegio Norte')).toBeInTheDocument();
    expect(screen.getByText('DANE 105001001234')).toBeInTheDocument();
  });

  it('colegio sin nombre todavía → la cabecera sigue siendo EduPlatform', async () => {
    vi.mocked(getContextoColegio).mockResolvedValue({
      ...contexto,
      nombre: '',
      codigoDane: '',
    });

    renderFlow();
    await identificar(EMAIL);

    // El chip dice «entrando como …» pero el nombre visible no queda vacío.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('EduPlatform');
    expect(screen.getByText('Plataforma escolar')).toBeInTheDocument();
    expect(screen.getByText('EP')).toBeInTheDocument();
  });

  it('con el colegio en el subdominio: branding de entrada y login con subdominio', async () => {
    vi.mocked(subdominioActual).mockReturnValue('juanaarias');
    vi.mocked(getContextoColegio).mockResolvedValue({
      ...contexto,
      nombre: 'I.E.T.D. Juana Arias',
      subdominio: 'juanaarias',
    });

    renderFlow();

    // El nombre del colegio aparece sin escribir el usuario todavía.
    expect(await screen.findByText('I.E.T.D. Juana Arias')).toBeInTheDocument();
    expect(getContextoColegio).toHaveBeenCalledWith('juanaarias');

    // El usuario puede ser un correo de cualquier dominio: no se consulta el dominio.
    await userEvent.type(screen.getByLabelText(/^nombre de usuario/i), 'rector@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: /continuar|buscando tu colegio/i }));

    await userEvent.type(await screen.findByLabelText(/^contraseña/i), 'ClaveLarga1');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() =>
      expect(iniciarSesion).toHaveBeenCalledWith(
        expect.objectContaining({ usuario: 'rector@gmail.com', subdominio: 'juanaarias' }),
      ),
    );
  });

  it('sin subdominio en la URL, el colegio sale del sufijo del usuario', async () => {
    vi.mocked(getContextoColegio).mockResolvedValue({
      ...contexto,
      nombre: 'I.E.T.D. Juana Arias',
      subdominio: 'juanaarias',
    });

    renderFlow();
    await identificar('maria@juanaarias');

    // El sufijo `juanaarias` es el colegio: no se consulta por dominio.
    expect(getContextoColegio).toHaveBeenCalledWith('juanaarias');

    await userEvent.type(screen.getByLabelText(/^contraseña/i), 'ClaveSegura123');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() =>
      expect(iniciarSesion).toHaveBeenCalledWith(
        expect.objectContaining({ usuario: 'maria@juanaarias' }),
      ),
    );
    // Sin subdominio en la URL no se manda el campo.
    expect(vi.mocked(iniciarSesion).mock.calls[0]?.[0]).not.toHaveProperty('subdominio');
  });

  it('subdominio que no existe → aviso y se puede seguir con el usuario', async () => {
    vi.mocked(subdominioActual).mockReturnValue('fantasma');
    vi.mocked(getContextoColegio).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'No existe un colegio con ese subdominio'),
    );

    renderFlow();

    expect(
      await screen.findByText('No encontramos un colegio en esta dirección. Revisa el enlace.'),
    ).toBeInTheDocument();
    // El formulario sigue disponible: el usuario puede entrar igual.
    expect(screen.getByLabelText(/^nombre de usuario/i)).toBeInTheDocument();
  });

  it('el paso 1 valida el nombre de usuario antes de consultar', async () => {
    renderFlow();
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByText('Ingresa tu nombre de usuario.')).toBeInTheDocument();

    // 'ab' no llega a 3 caracteres: es el mínimo del identificador.
    await userEvent.type(screen.getByLabelText(/^nombre de usuario/i), 'ab');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(
      await screen.findByText('Solo minúsculas, números, puntos, guiones y @ (3–64 caracteres).'),
    ).toBeInTheDocument();
    expect(vi.mocked(getContextoColegio)).not.toHaveBeenCalled();
  });

  it('usuario de un colegio inexistente (404) → error en el campo, sin avanzar', async () => {
    vi.mocked(getContextoColegio).mockRejectedValue(
      new ApiError(
        404,
        'NOT_FOUND',
        'No encontramos un colegio registrado con ese dominio de correo',
      ),
    );
    renderFlow();
    await userEvent.type(screen.getByLabelText(/^nombre de usuario/i), 'alguien@desconocido');
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(
      await screen.findByText('No encontramos ningún colegio para ese usuario.'),
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
      usuario: EMAIL,
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
      new ApiError(401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos'),
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

  it('el aviso de "¿Olvidaste?" desaparece al volver a cambiar el usuario', async () => {
    renderFlow();
    await identificar(EMAIL);

    await userEvent.click(screen.getByRole('button', { name: /¿olvidaste\?/i }));
    expect(await screen.findByText(/Para restablecer tu contraseña/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /cambiar usuario/i }));
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
    expect(vi.mocked(getContextoColegio)).toHaveBeenCalledTimes(1);
  });

  it('al invalidar el contexto se vuelve a consultar (cambio de color del colegio)', async () => {
    const cliente = nuevoCliente();
    renderFlow(cliente);
    await identificar(EMAIL);
    expect(vi.mocked(getContextoColegio)).toHaveBeenCalledTimes(1);

    // El colegio cambió su color: el módulo de colegios invalida la caché…
    vi.mocked(getContextoColegio).mockResolvedValue({ ...contexto, primaryColor: '#a3331a' });
    await act(async () => {
      await cliente.invalidateQueries({ queryKey: ['contexto-colegio'] });
    });

    // …y la siguiente identificación ya trae el valor nuevo, sin esperar TTL.
    await userEvent.click(screen.getByRole('button', { name: /cambiar usuario/i }));
    await identificar(EMAIL);
    expect(vi.mocked(getContextoColegio)).toHaveBeenCalledTimes(2);
  });
});
