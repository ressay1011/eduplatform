/**
 * DashboardShell — marco del panel.
 *
 * Se pinta con una sesión de colegio para cubrir el saludo del usuario
 * (`nombreCorto`) y las iniciales del avatar, que es lo que cambió al
 * normalizar nombres y apellidos opcionales. Sin sesión el shell muestra el
 * estado de carga y no llega a esa rama.
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
  cerrarSesion: vi.fn(),
}));

import { getSesion } from '@/lib/api';
import { DashboardShell } from '../DashboardShell';

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

function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardShell seccion="inicio" breadcrumb="Colegio · Inicio">
        <p>contenido del panel</p>
      </DashboardShell>
    </QueryClientProvider>,
  );
}

describe('DashboardShell', () => {
  beforeEach(() => {
    vi.mocked(getSesion).mockResolvedValue(sesion);
  });

  it('muestra el nombre corto y las iniciales del usuario de la sesión', async () => {
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('Yasser B.')).toBeDefined();
    });
    // Iniciales del avatar: primeras dos palabras de nombres + apellidos.
    expect(screen.getByText('YD')).toBeDefined();
    expect(screen.getByText('I.E.T.D. Juana Arias')).toBeDefined();
    expect(screen.getByText('contenido del panel')).toBeDefined();
  });

  it('con nombres vacíos no rompe el saludo', async () => {
    vi.mocked(getSesion).mockResolvedValue({
      ...sesion,
      usuario: { ...sesion.usuario, nombres: '', apellidos: '' },
    });
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('I.E.T.D. Juana Arias')).toBeDefined();
    });
    // El colegio sin nombre de usuario sigue pintando el marco.
    expect(screen.getByText('contenido del panel')).toBeDefined();
  });
});
