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
  ColegioDane,
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
    buscarColegioDane: vi.fn(),
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
  ApiError,
  actualizarUsuario,
  buscarColegioDane,
  crearUsuario,
  getOnboarding,
  guardarColegioOnboarding,
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
      nombreOficial: null,
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
      { numero: 2, nombre: 'Período 2', fechaInicio: '2026-04-28', fechaFin: '2026-07-03' },
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

const DANE: ColegioDane = {
  codigoDane: '147555000295',
  anio: 2025,
  // El MEN manda el nombre crudo: la página lo sanea antes de prellenar.
  nombre: 'INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
  municipio: 'Plato',
  departamento: 'Magdalena',
  direccion: 'CALLE 6A CARRERA 15 ESQUINA',
  telefono: '3001234567',
  email: 'rectoria@juanaarias.edu.co',
  calendario: 'B',
  sector: 'OFICIAL',
  caracter: 'Técnico/Academico',
  rector: 'ARMANDO JAIME DE ARCO CACERES',
  matricula: 3748,
  sedes: 7,
};

/** Colegio recién creado: todavía no tiene código DANE guardado. */
function estadoSinCodigo(): EstadoOnboarding {
  const datos = estado(1);
  datos.colegio.codigoDane = '';
  datos.colegio.nombre = '';
  datos.colegio.subdominio = '';
  return datos;
}

describe('Onboarding · paso 1 (identidad)', () => {
  it('no ofrece el dominio de correo como campo editable', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    expect(await screen.findByLabelText('Nombre')).toHaveValue('I.E. Demo');
    expect(screen.queryByLabelText('Dominio de correo')).toBeNull();
    expect(screen.getByText('demo.edu.co')).toBeInTheDocument();
  });

  it('oculta el formulario hasta que hay código DANE', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estadoSinCodigo());
    renderPagina();

    expect(await screen.findByLabelText('Código DANE')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(screen.queryByLabelText('Departamento')).toBeNull();
    expect(screen.queryByRole('button', { name: /continuar a sedes/i })).toBeNull();
    expect(screen.getByText(/para ver el resto del formulario/i)).toBeInTheDocument();
  });

  it('busca solo al llegar a los 12 dígitos, muestra el formulario y lo prellena', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estadoSinCodigo());
    vi.mocked(buscarColegioDane).mockResolvedValue(DANE);
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Código DANE'), {
      target: { value: '147555000295' },
    });

    // Sin botón: el disparo es el decimosegundo dígito.
    expect(buscarColegioDane).toHaveBeenCalledWith('147555000295');
    const nombre = await screen.findByLabelText('Nombre');
    expect(nombre).toHaveValue('I.E.T.D. Juana Arias de Benavides');
    // El nombre completo del MEN se guarda aparte, para los documentos.
    expect(screen.getByLabelText('Nombre oficial (documentos)')).toHaveValue(
      'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
    );
    expect(screen.getByLabelText('Departamento')).toHaveValue('Magdalena');
    expect(screen.getByLabelText('Municipio')).toHaveValue('Plato');
    expect(screen.getByLabelText('Dirección')).toHaveValue(DANE.direccion);
    expect(screen.getByText(/Datos del MEN de 2025/)).toBeInTheDocument();
  });

  it('no consulta el portal ni muestra el formulario con el código incompleto', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estadoSinCodigo());
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Código DANE'), { target: { value: '123' } });

    expect(buscarColegioDane).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
  });

  it.each([
    [404, 'NOT_FOUND', 'No encontramos un establecimiento educativo con ese código DANE.'],
    [
      502,
      'BAD_GATEWAY',
      'El servicio de datos del MEN no respondió. Intenta de nuevo en unos minutos.',
    ],
  ])('muestra el formulario igual si el MEN responde %i', async (estadoHttp, codigo, mensaje) => {
    vi.mocked(getOnboarding).mockResolvedValue(estadoSinCodigo());
    vi.mocked(buscarColegioDane).mockRejectedValue(new ApiError(estadoHttp, codigo, mensaje));
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Código DANE'), {
      target: { value: '999999999999' },
    });

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar a sedes/i })).toBeInTheDocument();
  });

  it('muestra el formulario de entrada si el colegio ya tiene código guardado', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
    expect(buscarColegioDane).not.toHaveBeenCalled();
  });

  it('pone el año lectivo en la misma fila que el calendario', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    const anio = await screen.findByLabelText('Año lectivo');
    expect(anio.closest('.onb-fila-calendario')).not.toBeNull();
    expect(screen.getByRole('radiogroup', { name: /calendario escolar/i })).toBeInTheDocument();
  });

  it('oculta los períodos mientras no haya calendario elegido', async () => {
    const datos = estado(1);
    // Solo un colegio sin calendario llegaría así (la columna es NOT NULL).
    datos.colegio.calendario = '' as 'A';
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.queryByText(/Períodos académicos precargados/i)).toBeNull();

    fireEvent.click(screen.getByLabelText('Calendario B'));

    expect(screen.getByText(/Períodos académicos precargados/i)).toBeInTheDocument();
    expect(screen.getByText('Período 4')).toBeInTheDocument();
  });

  it('filtra los municipios por departamento y limpia el que no corresponde', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    const municipio = await screen.findByLabelText('Municipio');
    expect(municipio).toHaveValue('Plato');
    expect(screen.getByRole('option', { name: 'Plato' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Caldas');

    expect(municipio).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Plato' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Manizales' })).toBeInTheDocument();
  });

  it('valida el correo antes de continuar', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Correo del colegio'), {
      target: { value: 'rectoria-sin-arroba' },
    });
    await userEvent.click(screen.getByRole('button', { name: /continuar a sedes/i }));

    expect(await screen.findByText(/Correo inválido/i)).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('guarda el nombre oficial junto al nombre corto', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    vi.mocked(guardarColegioOnboarding).mockResolvedValue(estado(2));
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Nombre oficial (documentos)'), {
      target: { value: 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES' },
    });
    await userEvent.click(screen.getByRole('button', { name: /continuar a sedes/i }));

    await waitFor(() => expect(guardarColegioOnboarding).toHaveBeenCalledTimes(1));
    expect(guardarColegioOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'I.E. Demo',
        nombreOficial: 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
        subdominio: 'demo',
      }),
    );
  });

  it('«Guardar y salir» guarda el paso 1 y sale al dashboard', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    vi.mocked(guardarColegioOnboarding).mockResolvedValue(estado(1));
    vi.mocked(guardarPasoOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    await screen.findByLabelText('Nombre');
    await userEvent.click(screen.getByRole('button', { name: /guardar y salir/i }));

    await waitFor(() => expect(guardarColegioOnboarding).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('«Guardar y salir» no sale si el formulario tiene errores', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Correo del colegio'), {
      target: { value: 'malo' },
    });
    await userEvent.click(screen.getByRole('button', { name: /guardar y salir/i }));

    expect(await screen.findByText(/Correo inválido/i)).toBeInTheDocument();
    expect(await screen.findByText(/no se guardó nada/i)).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sugiere el subdominio a partir del nombre', async () => {
    const datos = estado(1);
    datos.colegio.subdominio = '';
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'I.E.T.D. Juana Arias de Benavides' },
    });

    expect(screen.getByLabelText('Subdominio')).toHaveValue('ietd-juana-arias-de-benavides');
  });

  it('respeta el subdominio propio del colegio aunque cambie el nombre', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Otro nombre' } });

    expect(screen.getByLabelText('Subdominio')).toHaveValue('demo');
  });
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
