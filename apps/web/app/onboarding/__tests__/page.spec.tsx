/**
 * Onboarding · pasos 4 (personal) y 5 (CSV de matrículas).
 *
 * La API va mockeada: aquí se prueba la máquina de la página (render, alta con
 * la contraseña temporal, baja lógica, vista previa del CSV e importación).
 * El contrato real de la API lo cubre `matriculas.e2e.spec.ts`.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CursoMatricula,
  EstadoOnboarding,
  ListaPersonas,
  ListaRoles,
  PersonaEmpleado,
  UsuarioListado,
} from '@eduplatform/types';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
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
    getOnboarding: vi.fn(),
    guardarColegioOnboarding: vi.fn(),
    guardarSedeOnboarding: vi.fn(),
    generarEstructuraOnboarding: vi.fn(),
    guardarPasoOnboarding: vi.fn(),
    finalizarOnboarding: vi.fn(),
    crearUsuario: vi.fn(),
    actualizarUsuario: vi.fn(),
    importarMatriculas: vi.fn(),
    listarCursosMatricula: vi.fn(),
    listarRoles: vi.fn(),
    obtenerSedes: vi.fn(),
    listarEmpleados: vi.fn(),
  };
});

import {
  actualizarUsuario,
  crearUsuario,
  getOnboarding,
  guardarPasoOnboarding,
  importarMatriculas,
  listarCursosMatricula,
  listarEmpleados,
  listarRoles,
  obtenerSedes,
} from '@/lib/api';
import OnboardingPage from '../page';

const CURSO: CursoMatricula = {
  id: 'curso-1',
  nombre: '6° A',
  grado: 6,
  letra: 'A',
  jornada: 'MANANA',
  sedeId: 'sede-1',
  sedeNombre: 'Sede Principal',
  anioLectivoId: 'anio-1',
  anio: 2026,
};

function estado(paso: number): EstadoOnboarding {
  return {
    completado: false,
    paso,
    colegio: {
      id: 'colegio-1',
      nombre: 'I.E. Demo',
      nit: null,
      codigoDane: '105001001234',
      subdominio: 'demo',
      dominioEmail: 'demo.edu.co',
      municipio: 'Plato',
      departamento: 'Magdalena',
      direccion: null,
      telefono: null,
      email: 'rectoria@demo.edu.co',
      calendario: 'A',
    },
    sedes: [
      {
        id: 'sede-1',
        nombre: 'Sede Principal',
        codigoDaneSede: null,
        direccion: null,
        jornadas: ['MANANA'],
      },
    ],
    anioLectivo: { id: 'anio-1', anio: 2026, fechaInicio: '2026-02-02', fechaFin: '2026-11-30' },
    periodos: [
      { numero: 1, nombre: 'Período 1', fechaInicio: '2026-02-02', fechaFin: '2026-04-24' },
    ],
    estructura: { grados: 1, cursos: 1 },
    personal: { total: 2 },
    estudiantes: { total: 3, matriculados: 1 },
    checklist: [],
  };
}

const EMPLEADO: PersonaEmpleado = {
  id: 'persona-1',
  nombres: 'Carlos',
  apellidos: 'Pérez',
  email: 'carlos@demo.edu.co',
  tipoDocumento: 'CC',
  numeroDocumento: '1088123456',
  esAdmin: false,
  activo: true,
  rolId: 'rol-1',
  rolNombre: 'Docente',
  alcance: 'TODAS',
  sedes: [],
  ultimoAcceso: null,
};

const USUARIO: UsuarioListado = {
  id: 'persona-1',
  nombres: 'Carlos',
  apellidos: 'Pérez',
  email: 'carlos@demo.edu.co',
  tipoDocumento: 'CC',
  numeroDocumento: '1088123456',
  esAdmin: false,
  activo: true,
  debeCambiarPassword: false,
  ultimoAcceso: null,
  permisos: [],
  rolId: 'rol-1',
  rolNombre: 'Docente',
  alcance: 'TODAS',
  sedes: [],
};

const ROLES: ListaRoles = {
  items: [
    {
      id: 'rol-1',
      nombre: 'Docente',
      descripcion: null,
      tipoPersona: 'EMPLEADO',
      esPredeterminado: true,
      activo: true,
      permisos: [],
      personas: 1,
    },
    {
      id: 'rol-2',
      nombre: 'Estudiante',
      descripcion: null,
      tipoPersona: 'ESTUDIANTE',
      esPredeterminado: true,
      activo: true,
      permisos: [],
      personas: 0,
    },
  ],
};

function personal(items: PersonaEmpleado[]): ListaPersonas<PersonaEmpleado> {
  return { items, total: items.length, page: 1, limit: 100 };
}

function renderPagina() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <OnboardingPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listarRoles).mockResolvedValue(ROLES);
  vi.mocked(obtenerSedes).mockResolvedValue([{ id: 'sede-1', nombre: 'Sede Principal' }]);
  vi.mocked(listarEmpleados).mockResolvedValue(personal([]));
  vi.mocked(listarCursosMatricula).mockResolvedValue([CURSO]);
  vi.mocked(guardarPasoOnboarding).mockResolvedValue(estado(5));
});

describe('Onboarding · paso 4 (personal)', () => {
  it('muestra el formulario y agrega a la persona con su contraseña temporal', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(4));
    vi.mocked(crearUsuario).mockResolvedValue({
      usuario: {
        ...USUARIO,
        nombres: 'Laura',
        apellidos: 'Ramírez',
        email: 'laura@demo.edu.co',
        numeroDocumento: '1088999',
        debeCambiarPassword: true,
      },
      passwordTemporal: 'Temp-2026!',
    });

    renderPagina();
    await screen.findByRole('heading', { name: 'Personal del colegio' });

    await userEvent.type(screen.getByLabelText('Nombres'), 'Laura');
    await userEvent.type(screen.getByLabelText('Apellidos'), 'Ramírez');
    await userEvent.selectOptions(screen.getByLabelText(/^Tipo de documento/), 'TI');
    await userEvent.type(screen.getByLabelText('Número de documento'), '1088999');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'laura@demo.edu.co');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'rol-1');
    await userEvent.selectOptions(screen.getByLabelText(/^Sede/), 'sede-1');

    await userEvent.click(screen.getByRole('button', { name: /agregar al equipo/i }));

    await waitFor(() => expect(crearUsuario).toHaveBeenCalledTimes(1));
    expect(crearUsuario).toHaveBeenCalledWith(
      expect.objectContaining({
        nombres: 'Laura',
        apellidos: 'Ramírez',
        email: 'laura@demo.edu.co',
        tipoDocumento: 'TI',
        numeroDocumento: '1088999',
        rolId: 'rol-1',
        esAdmin: false,
        alcance: 'ESPECIFICAS',
        sedesIds: ['sede-1'],
      }),
    );
    expect(await screen.findByText('Temp-2026!')).toBeInTheDocument();
  });

  it('no agrega si el formulario está incompleto', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(4));

    renderPagina();
    await screen.findByRole('heading', { name: 'Personal del colegio' });
    await userEvent.click(screen.getByRole('button', { name: /agregar al equipo/i }));

    expect(
      await screen.findByText(/Completa nombres, apellidos, documento, correo y rol/i),
    ).toBeInTheDocument();
    expect(crearUsuario).not.toHaveBeenCalled();
  });

  it('muestra el mensaje por defecto ante un error que no es de la API', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(4));
    vi.mocked(crearUsuario).mockRejectedValue(new Error('boom'));

    renderPagina();
    await screen.findByRole('heading', { name: 'Personal del colegio' });
    await userEvent.type(screen.getByLabelText('Nombres'), 'Laura');
    await userEvent.type(screen.getByLabelText('Apellidos'), 'Ramírez');
    await userEvent.type(screen.getByLabelText('Número de documento'), '1088999');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'laura@demo.edu.co');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'rol-1');
    await userEvent.click(screen.getByRole('button', { name: /agregar al equipo/i }));

    expect(await screen.findByText('No se pudo agregar a la persona.')).toBeInTheDocument();
  });

  it('da de baja a una persona del listado', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(4));
    vi.mocked(listarEmpleados).mockResolvedValue(personal([EMPLEADO]));
    vi.mocked(actualizarUsuario).mockResolvedValue({ ...USUARIO, activo: false });

    renderPagina();
    await screen.findByText('Carlos Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    await waitFor(() =>
      expect(actualizarUsuario).toHaveBeenCalledWith('persona-1', { activo: false }),
    );
    expect(await screen.findByText(/quedó inactivo/i)).toBeInTheDocument();
  });

  it('informa si la baja falla', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(4));
    vi.mocked(listarEmpleados).mockResolvedValue(personal([EMPLEADO]));
    vi.mocked(actualizarUsuario).mockRejectedValue(new Error('boom'));

    renderPagina();
    await screen.findByText('Carlos Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(await screen.findByText('No se pudo quitar a la persona.')).toBeInTheDocument();
  });
});

describe('Onboarding · paso 5 (CSV de matrículas)', () => {
  it('lee el archivo, marca la fila válida y la importa', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));
    vi.mocked(importarMatriculas).mockResolvedValue({ creadas: 1, errores: [] });

    renderPagina();
    await screen.findByRole('heading', { name: 'Estudiantes' });

    const csv = [
      'documento,nombres,apellidos,correo,sede,grado,letra,jornada',
      '1098765432,Ana María,Gómez,ana@demo.edu.co,Sede Principal,6,A,Mañana',
    ].join('\n');
    const archivo = new File([csv], 'matriculas.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText(/elegir archivo csv/i), {
      target: { files: [archivo] },
    });

    expect(await screen.findByText('1098765432')).toBeInTheDocument();
    expect(screen.getByText('Válida')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /importar 1 fila/i }));

    await waitFor(() => expect(importarMatriculas).toHaveBeenCalledTimes(1));
    expect(importarMatriculas).toHaveBeenCalledWith({
      filas: [
        expect.objectContaining({
          documento: '1098765432',
          sede: 'Sede Principal',
          grado: '6',
          letra: 'A',
          jornada: 'Mañana',
        }),
      ],
    });
    expect(await screen.findByText(/Se matricularon 1 estudiante/)).toBeInTheDocument();
  });

  it('marca como inválida la fila cuyo curso no existe y bloquea la importación', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));

    renderPagina();
    await screen.findByRole('heading', { name: 'Estudiantes' });

    const csv = [
      'documento,nombres,apellidos,correo,sede,grado,letra,jornada',
      '1098765433,,,,Sede Fantasma,6,A,Mañana',
    ].join('\n');
    const archivo = new File([csv], 'otro.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText(/elegir archivo csv/i), {
      target: { files: [archivo] },
    });

    expect(await screen.findByText(/no existe en el colegio/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /importar 0 fila/i })).toBeDisabled();
  });

  it('continúa al resumen y guarda el paso', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));
    vi.mocked(guardarPasoOnboarding).mockResolvedValue(estado(6));

    renderPagina();
    await screen.findByRole('heading', { name: 'Estudiantes' });
    await userEvent.click(screen.getByRole('button', { name: /continuar al resumen/i }));

    await waitFor(() => expect(guardarPasoOnboarding).toHaveBeenCalledWith(6));
    expect(await screen.findByRole('heading', { name: 'Todo listo' })).toBeInTheDocument();
  });

  it('avisa si el archivo no se puede leer', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));

    renderPagina();
    await screen.findByRole('heading', { name: 'Estudiantes' });

    const archivo = new File(['x'], 'roto.csv', { type: 'text/csv' });
    Object.defineProperty(archivo, 'text', {
      value: () => Promise.reject(new Error('ilegible')),
      configurable: true,
    });
    fireEvent.change(screen.getByLabelText(/elegir archivo csv/i), {
      target: { files: [archivo] },
    });

    expect(await screen.findByText(/No pudimos leer el archivo/)).toBeInTheDocument();
  });

  it('informa si la importación falla', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));
    vi.mocked(importarMatriculas).mockRejectedValue(new Error('boom'));

    renderPagina();
    await screen.findByRole('heading', { name: 'Estudiantes' });

    const csv = [
      'documento,nombres,apellidos,correo,sede,grado,letra,jornada',
      '1098765432,Ana María,Gómez,ana@demo.edu.co,Sede Principal,6,A,Mañana',
    ].join('\n');
    fireEvent.change(screen.getByLabelText(/elegir archivo csv/i), {
      target: { files: [new File([csv], 'matriculas.csv', { type: 'text/csv' })] },
    });

    await screen.findByText('1098765432');
    await userEvent.click(screen.getByRole('button', { name: /importar 1 fila/i }));

    expect(await screen.findByText('No se pudo importar el CSV.')).toBeInTheDocument();
  });
});
