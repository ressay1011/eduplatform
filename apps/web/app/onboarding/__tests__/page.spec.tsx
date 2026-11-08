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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    cerrarSesion: vi.fn(),
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
  cerrarSesion,
  crearUsuario,
  getOnboarding,
  guardarColegioOnboarding,
  guardarPasoOnboarding,
  guardarSedeOnboarding,
  importarMatriculas,
  listarCursosMatricula,
  listarEmpleados,
  listarRoles,
  obtenerSedes,
} from '@/lib/api';
import OnboardingPage from '../page';

/**
 * Año en curso: el wizard compara con él el año lectivo y las fechas de los
 * períodos. Los fixtures lo usan para no caducar el 1 de enero.
 */
const ANIO = new Date().getFullYear();

/** Fecha ISO del año en curso, con el mes y el día indicados. */
function fecha(mes: number, dia: number): string {
  return `${ANIO}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const CURSO: CursoMatricula = {
  id: 'curso-1',
  nombre: '6° A',
  grado: 6,
  letra: 'A',
  jornada: 'MANANA',
  sedeId: 'sede-1',
  sedeNombre: 'Sede Principal',
  anioLectivoId: 'anio-1',
  anio: ANIO,
};

function estado(paso: number): EstadoOnboarding {
  return {
    completado: false,
    paso,
    // Año del servidor: el wizard propone con este, no con el reloj del equipo.
    anioActual: ANIO,
    colegio: {
      id: 'colegio-1',
      nombre: 'I.E. Demo',
      nombreOficial: null,
      nit: null,
      codigoDane: '105001001234',
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
    anioLectivo: {
      id: 'anio-1',
      anio: ANIO,
      fechaInicio: fecha(2, 2),
      fechaFin: fecha(11, 30),
    },
    periodos: [
      { numero: 1, nombre: 'Período 1', fechaInicio: fecha(2, 2), fechaFin: fecha(4, 24) },
      { numero: 2, nombre: 'Período 2', fechaInicio: fecha(4, 28), fechaFin: fecha(7, 3) },
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
  usuario: 'carlos@demo',
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
  usuario: 'carlos@demo',
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
  vi.mocked(guardarPasoOnboarding).mockResolvedValue(estado(6));
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
  return datos;
}

describe('Onboarding · paso 1 (identidad)', () => {
  it('no ofrece el dominio de correo como campo editable', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    expect(await screen.findByLabelText('Nombre')).toHaveValue('I.E. Demo');
    expect(screen.queryByLabelText('Dominio de correo')).toBeNull();
  });

  it('oculta el formulario hasta que hay código DANE', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estadoSinCodigo());
    renderPagina();

    expect(await screen.findByLabelText('Código DANE')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(screen.queryByLabelText('Departamento')).toBeNull();
    expect(screen.queryByRole('button', { name: /continuar al calendario/i })).toBeNull();
    expect(screen.getByText('Digita los 12 dígitos del código DANE.')).toBeInTheDocument();
    // Sin código guardado, el campo recibe el foco.
    expect(screen.getByLabelText('Código DANE')).toHaveFocus();
  });

  it('no roba el foco cuando el colegio ya tiene código DANE', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    const dane = await screen.findByLabelText('Código DANE');
    expect(dane).not.toHaveFocus();
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
    expect(screen.getByRole('button', { name: /continuar al calendario/i })).toBeInTheDocument();
  });

  it('muestra el formulario de entrada si el colegio ya tiene código guardado', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
    expect(buscarColegioDane).not.toHaveBeenCalled();
  });

  it('pone el año lectivo en la misma fila que el calendario', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(2));
    renderPagina();

    const anio = await screen.findByLabelText('Año lectivo');
    expect(anio.closest('.onb-fila-calendario')).not.toBeNull();
    expect(screen.getByRole('radiogroup', { name: /calendario escolar/i })).toBeInTheDocument();
  });

  it('propone el año y los períodos del SERVIDOR, no los del reloj del equipo', async () => {
    const datos = estado(2);
    datos.anioActual = 2031; // el equipo dirá otro año: manda el del servidor
    datos.anioLectivo = null;
    datos.periodos = [];
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    const anio = await screen.findByLabelText('Año lectivo');
    expect(anio).toHaveValue('2031');
    expect(Array.from(anio.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      '2030',
      '2031',
      '2032',
    ]);

    // Las fechas propuestas salen del mismo año del servidor.
    expect(await screen.findByDisplayValue('2031-02-02')).toBeInTheDocument();
  });

  it('oculta los períodos mientras no haya calendario elegido', async () => {
    const datos = estado(2);
    // Solo un colegio sin calendario llegaría así (la columna es NOT NULL).
    datos.colegio.calendario = '' as 'A';
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    expect(await screen.findByLabelText('Calendario A')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: /continuar al calendario/i }));

    expect(await screen.findByText(/Correo inválido/i)).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('valida el correo y el NIT al perder el foco, sin pulsar Continuar', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    const correo = await screen.findByLabelText('Correo del colegio');
    fireEvent.change(correo, { target: { value: 'rectoria-sin-arroba' } });
    fireEvent.blur(correo);
    expect(await screen.findByText(/Correo inválido/i)).toBeInTheDocument();

    const nit = screen.getByLabelText('NIT (opcional)');
    fireEvent.change(nit, { target: { value: '123' } });
    fireEvent.blur(nit);
    expect(await screen.findByText(/NIT inválido/i)).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();

    // Al corregir y volver a salir, el error desaparece sin pulsar nada más.
    fireEvent.change(correo, { target: { value: 'rectoria@demo.edu.co' } });
    fireEvent.blur(correo);
    await waitFor(() => expect(screen.queryByText(/Correo inválido/i)).toBeNull());
  });

  it('guarda el nombre oficial junto al nombre corto', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    vi.mocked(guardarColegioOnboarding).mockResolvedValue(estado(3));
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Nombre oficial (documentos)'), {
      target: { value: 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES' },
    });
    await userEvent.click(screen.getByRole('button', { name: /continuar al calendario/i }));

    await waitFor(() => expect(guardarColegioOnboarding).toHaveBeenCalledTimes(1));
    expect(guardarColegioOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'I.E. Demo',
        nombreOficial: 'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
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

  it('valida NIT y teléfono antes de continuar', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    fireEvent.change(await screen.findByLabelText('NIT (opcional)'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '12' } });
    await userEvent.click(screen.getByRole('button', { name: /continuar al calendario/i }));

    expect(await screen.findByText(/NIT inválido/i)).toBeInTheDocument();
    expect(screen.getByText(/Teléfono inválido/i)).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
  });

  it('el año lectivo solo ofrece el anterior, el actual y el próximo', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(2));
    renderPagina();

    const anio = await screen.findByLabelText('Año lectivo');
    const opciones = Array.from(anio.querySelectorAll('option')).map((o) => o.value);
    expect(opciones).toEqual([String(ANIO - 1), String(ANIO), String(ANIO + 1)]);
    expect(anio).toHaveValue(String(ANIO));
  });

  it('rechaza períodos que empiezan antes del año lectivo', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(2));
    renderPagina();

    await screen.findByLabelText('Calendario A');
    fireEvent.change(screen.getAllByLabelText('Inicio')[0]!, {
      target: { value: `${ANIO - 2}-02-02` },
    });
    await userEvent.click(screen.getByRole('button', { name: /continuar a sedes/i }));

    expect(
      await screen.findByText(new RegExp(`no puede empezar antes del año lectivo`)),
    ).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
  });

  it('rechaza períodos que se cruzan o terminan antes de empezar', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(2));
    renderPagina();

    await screen.findByLabelText('Calendario A');
    // El período 2 empieza antes de que termine el 1.
    fireEvent.change(screen.getAllByLabelText('Inicio')[1]!, { target: { value: fecha(3, 1) } });
    await userEvent.click(screen.getByRole('button', { name: /continuar a sedes/i }));

    expect(await screen.findByText(/se cruza con el período anterior/i)).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
  });

  it('regenera las fechas de los períodos al cambiar el año lectivo', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(2));
    renderPagina();

    const anio = await screen.findByLabelText('Año lectivo');
    fireEvent.change(anio, { target: { value: String(ANIO + 1) } });

    const inicios = screen.getAllByLabelText('Inicio') as HTMLInputElement[];
    expect(inicios[0]!.value.startsWith(String(ANIO + 1))).toBe(true);
  });

  it('«Guardar y salir» en el paso 2 guarda la sede', async () => {
    const datos = estado(3);
    datos.sedes[0]!.jornadas = ['MANANA'];
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    vi.mocked(guardarSedeOnboarding).mockResolvedValue(estado(3));
    vi.mocked(guardarPasoOnboarding).mockResolvedValue(estado(3));
    renderPagina();

    await screen.findByRole('heading', { name: 'Sedes y jornadas', level: 1 });
    await userEvent.click(screen.getByRole('button', { name: /guardar y salir/i }));

    await waitFor(() => expect(guardarSedeOnboarding).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('rechaza nombre corto, departamento vacío y municipio sin elegir', async () => {
    const datos = estado(1);
    datos.colegio.departamento = '';
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'AB' } });
    await userEvent.click(screen.getByRole('button', { name: /continuar al calendario/i }));

    expect(await screen.findByText('Escribe el nombre del colegio.')).toBeInTheDocument();
    expect(screen.getByText('Elige el departamento.')).toBeInTheDocument();
    expect(screen.getByText('Elige el municipio del departamento.')).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
  });

  it('borra el error del campo en cuanto se corrige', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    const correo = await screen.findByLabelText('Correo del colegio');
    fireEvent.change(correo, { target: { value: 'malo' } });
    await userEvent.click(screen.getByRole('button', { name: /continuar al calendario/i }));
    expect(await screen.findByText(/Correo inválido/i)).toBeInTheDocument();

    fireEvent.change(correo, { target: { value: 'rectoria@demo.edu.co' } });
    expect(screen.queryByText(/Correo inválido/i)).toBeNull();
  });

  it('exige las dos fechas de cada período y el orden correcto', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(2));
    renderPagina();

    await screen.findByLabelText('Calendario A');
    fireEvent.change(screen.getAllByLabelText('Fin')[0]!, { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: /continuar a sedes/i }));
    expect(await screen.findByText(/completa las dos fechas/i)).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText('Fin')[0]!, { target: { value: fecha(1, 5) } });
    await userEvent.click(screen.getByRole('button', { name: /continuar a sedes/i }));
    expect(await screen.findByText(/el inicio debe ser anterior al fin/i)).toBeInTheDocument();
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
  });

  it('permite elegir el municipio después del departamento', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    await userEvent.selectOptions(await screen.findByLabelText('Departamento'), 'Caldas');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Manizales');

    expect(screen.getByLabelText('Municipio')).toHaveValue('Manizales');
  });

  it('deja escribir las fechas de los períodos', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(2));
    renderPagina();

    const fin = (await screen.findAllByLabelText('Fin'))[0]!;
    fireEvent.change(fin, { target: { value: fecha(4, 30) } });

    expect((screen.getAllByLabelText('Fin')[0] as HTMLInputElement).value).toBe(fecha(4, 30));
  });

  it('agrega períodos hasta el tope de cuatro y no deja pasar de ahí', async () => {
    const datos = estado(2);
    datos.periodos = [
      ...datos.periodos,
      { numero: 3, nombre: 'Período 3', fechaInicio: fecha(7, 10), fechaFin: fecha(9, 30) },
    ];
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    await screen.findByLabelText('Calendario A');
    expect(screen.getByText('3 de 4 · mínimo dos períodos')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /agregar período/i }));

    expect(screen.getByText('4 de 4 · mínimo dos períodos')).toBeInTheDocument();
    expect(screen.getByText('Período 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /agregar período/i })).toBeDisabled();
  });

  it('quita un período y renumera el resto para no dejar huecos', async () => {
    const datos = estado(2);
    datos.periodos = [
      ...datos.periodos,
      { numero: 3, nombre: 'Período 3', fechaInicio: fecha(7, 10), fechaFin: fecha(9, 30) },
    ];
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    await screen.findByLabelText('Calendario A');
    await userEvent.click(screen.getByRole('button', { name: /quitar el período 2/i }));

    expect(screen.getByText('2 de 4 · mínimo dos períodos')).toBeInTheDocument();
    // El tercero pasa a ser el segundo: no quedan huecos en la numeración.
    expect(screen.queryByText('Período 3')).toBeNull();
    for (const boton of screen.getAllByRole('button', { name: /quitar el período/i })) {
      expect(boton).toBeDisabled();
    }
  });

  it('no vuelve a buscar si se reescribe el mismo código verificado', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    const dane = await screen.findByLabelText('Código DANE');
    fireEvent.change(dane, { target: { value: '105001001234' } });

    expect(buscarColegioDane).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('«Guardar y salir» sin código DANE avisa antes de cerrar', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estadoSinCodigo());
    renderPagina();

    await screen.findByLabelText('Código DANE');
    await userEvent.click(screen.getByRole('button', { name: /guardar y salir/i }));

    // Ya no sale en silencio: aparece el aviso y «Seguir aquí» no navega.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/¿Salir sin vincular el colegio\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /seguir aquí/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();

    // Desde el aviso se cierra la sesión de verdad y se vuelve al login.
    await userEvent.click(screen.getByRole('button', { name: /guardar y salir/i }));
    await userEvent.click(await screen.findByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(guardarColegioOnboarding).not.toHaveBeenCalled();
  });

  it('«Guardar y salir» pide la jornada si la sede no tiene', async () => {
    const datos = estado(3);
    datos.sedes[0]!.jornadas = [];
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    await screen.findByRole('heading', { name: 'Sedes y jornadas', level: 1 });
    await userEvent.click(screen.getByRole('button', { name: /guardar y salir/i }));

    expect(await screen.findByText(/Elige al menos una jornada/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('Onboarding · paso 4 (personal)', () => {
  it('muestra el formulario y agrega a la persona con su contraseña temporal', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));
    vi.mocked(crearUsuario).mockResolvedValue({
      usuario: {
        ...USUARIO,
        nombres: 'Laura',
        apellidos: 'Ramírez',
        usuario: 'laura@demo',
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
    await userEvent.type(screen.getByLabelText('Nombre de usuario'), 'laura@demo');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'rol-1');
    await userEvent.selectOptions(screen.getByLabelText(/^Sede/), 'sede-1');

    await userEvent.click(screen.getByRole('button', { name: /agregar al equipo/i }));

    await waitFor(() => expect(crearUsuario).toHaveBeenCalledTimes(1));
    expect(crearUsuario).toHaveBeenCalledWith(
      expect.objectContaining({
        nombres: 'Laura',
        apellidos: 'Ramírez',
        usuario: 'laura@demo',
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
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));

    renderPagina();
    await screen.findByRole('heading', { name: 'Personal del colegio' });
    await userEvent.click(screen.getByRole('button', { name: /agregar al equipo/i }));

    expect(
      await screen.findByText(/Completa nombres, apellidos, documento, usuario y rol/i),
    ).toBeInTheDocument();
    expect(crearUsuario).not.toHaveBeenCalled();
  });

  it('muestra el mensaje por defecto ante un error que no es de la API', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));
    vi.mocked(crearUsuario).mockRejectedValue(new Error('boom'));

    renderPagina();
    await screen.findByRole('heading', { name: 'Personal del colegio' });
    await userEvent.type(screen.getByLabelText('Nombres'), 'Laura');
    await userEvent.type(screen.getByLabelText('Apellidos'), 'Ramírez');
    await userEvent.type(screen.getByLabelText('Número de documento'), '1088999');
    await userEvent.type(screen.getByLabelText('Nombre de usuario'), 'laura@demo.edu.co');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'rol-1');
    await userEvent.click(screen.getByRole('button', { name: /agregar al equipo/i }));

    expect(await screen.findByText('No se pudo agregar a la persona.')).toBeInTheDocument();
  });

  it('da de baja a una persona del listado', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));
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
    vi.mocked(getOnboarding).mockResolvedValue(estado(5));
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
    vi.mocked(getOnboarding).mockResolvedValue(estado(6));
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
    vi.mocked(getOnboarding).mockResolvedValue(estado(6));

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
    vi.mocked(getOnboarding).mockResolvedValue(estado(6));
    vi.mocked(guardarPasoOnboarding).mockResolvedValue(estado(7));

    renderPagina();
    await screen.findByRole('heading', { name: 'Estudiantes' });
    await userEvent.click(screen.getByRole('button', { name: /continuar al resumen/i }));

    await waitFor(() => expect(guardarPasoOnboarding).toHaveBeenCalledWith(7));
    expect(await screen.findByRole('heading', { name: 'Todo listo' })).toBeInTheDocument();
  });

  it('avisa si el archivo no se puede leer', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(6));

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
    vi.mocked(getOnboarding).mockResolvedValue(estado(6));
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

describe('Onboarding · bienvenida, cabecera y gestos', () => {
  afterEach(() => {
    // `?bienvenida=1` se prueba cambiando la URL: se devuelve a la normal.
    window.history.pushState({}, '', '/');
  });

  /** Colegio recién creado: sin DANE, sin sedes y en el paso 1. */
  function estadoVacio() {
    const datos = estado(1);
    datos.sedes = [];
    datos.colegio.codigoDane = '';
    datos.colegio.nombre = '';
    return datos;
  }

  it('muestra la bienvenida solo con el colegio vacío', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estadoVacio());
    renderPagina();

    expect(
      await screen.findByRole('heading', { name: /empecemos a configurar tu colegio/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /empezar/i }));

    // «Empezar» entra al paso 1, que no cuenta como uno más de la bienvenida.
    expect(await screen.findByLabelText('Código DANE')).toBeInTheDocument();
    expect(screen.getByText(/de 7 · Colegio/)).toBeInTheDocument();
  });

  it('la bienvenida cierra la sesión de verdad', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estadoVacio());
    renderPagina();

    await screen.findByRole('heading', { name: /empecemos a configurar tu colegio/i });
    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('no repite la bienvenida si el colegio ya tiene sedes', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    await screen.findByLabelText('Código DANE');
    expect(
      screen.queryByRole('heading', { name: /empecemos a configurar tu colegio/i }),
    ).toBeNull();
  });

  it('la cabecera dice el paso y el título, y la barra lo refleja', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(3));
    renderPagina();

    expect(await screen.findByText(/de 7 · Sedes y jornadas/)).toBeInTheDocument();
    const barras = screen.getAllByRole('progressbar');
    expect(barras.length).toBeGreaterThan(0);
    for (const barra of barras) {
      expect(barra).toHaveAttribute('aria-valuenow', '3');
      expect(barra).toHaveAttribute('aria-valuemax', '7');
    }
  });

  it('en el paso 1 la cabecera no muestra el botón de volver', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(1));
    renderPagina();

    await screen.findByLabelText('Código DANE');
    expect(screen.queryByRole('button', { name: /paso anterior/i })).toBeNull();
  });

  it('deslizar a la derecha vuelve al paso anterior', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(3));
    renderPagina();

    await screen.findByRole('heading', { name: 'Sedes y jornadas', level: 1 });
    const main = screen.getByRole('main');
    fireEvent.touchStart(main, { touches: [{ clientX: 100, clientY: 300 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 220, clientY: 302 }] });

    expect(
      await screen.findByRole('heading', { name: 'Calendario y períodos', level: 1 }),
    ).toBeInTheDocument();
  });

  it('deslizar a la izquierda avanza y guarda como el botón', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(3));
    vi.mocked(guardarSedeOnboarding).mockResolvedValue(estado(4));
    renderPagina();

    await screen.findByRole('heading', { name: 'Sedes y jornadas', level: 1 });
    const main = screen.getByRole('main');
    fireEvent.touchStart(main, { touches: [{ clientX: 220, clientY: 300 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 100, clientY: 300 }] });

    await waitFor(() => expect(guardarSedeOnboarding).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole('heading', { name: 'Estructura académica', level: 1 }),
    ).toBeInTheDocument();
  });

  it('no avanza con el gesto si el paso está incompleto', async () => {
    const datos = estado(3);
    datos.sedes[0]!.jornadas = [];
    vi.mocked(getOnboarding).mockResolvedValue(datos);
    renderPagina();

    await screen.findByRole('heading', { name: 'Sedes y jornadas', level: 1 });
    const main = screen.getByRole('main');
    fireEvent.touchStart(main, { touches: [{ clientX: 220, clientY: 300 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 100, clientY: 300 }] });

    expect(guardarSedeOnboarding).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Sedes y jornadas', level: 1 })).toBeInTheDocument();
  });

  it('un deslizamiento vertical no cambia de paso', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(3));
    renderPagina();

    await screen.findByRole('heading', { name: 'Sedes y jornadas', level: 1 });
    const main = screen.getByRole('main');
    fireEvent.touchStart(main, { touches: [{ clientX: 220, clientY: 200 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 170, clientY: 300 }] });

    expect(screen.getByRole('heading', { name: 'Sedes y jornadas', level: 1 })).toBeInTheDocument();
    expect(guardarSedeOnboarding).not.toHaveBeenCalled();
  });

  it('las flechas del teclado mueven de paso', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(3));
    vi.mocked(guardarSedeOnboarding).mockResolvedValue(estado(4));
    renderPagina();

    await screen.findByRole('heading', { name: 'Sedes y jornadas', level: 1 });
    // El listener vive en un efecto: se reintenta el evento hasta que esté
    // registrado (si no, bajo carga el keyDown se pierde y el test parpadea).
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(guardarSedeOnboarding).toHaveBeenCalled();
    });

    expect(
      await screen.findByRole('heading', { name: 'Estructura académica', level: 1 }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(
      await screen.findByRole('heading', { name: 'Sedes y jornadas', level: 1 }),
    ).toBeInTheDocument();
  });

  it('las flechas no mueven de paso mientras se escribe en un campo', async () => {
    vi.mocked(getOnboarding).mockResolvedValue(estado(3));
    renderPagina();

    const nombre = await screen.findByLabelText('Nombre de la sede');
    nombre.focus();
    fireEvent.keyDown(nombre, { key: 'ArrowLeft' });

    expect(screen.getByRole('heading', { name: 'Sedes y jornadas', level: 1 })).toBeInTheDocument();
  });
});
