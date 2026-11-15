/**
 * DaneService — consulta del establecimiento en los datos abiertos del MEN.
 *
 * `fetch` va mockeado: aquí se prueba el contrato (normalización, 404 real vs
 * 403 de token, timeout, caché y la consulta SoQL que se envía), no la red.
 */
import { HttpException } from '@nestjs/common';
import type { ApiResponse } from '@eduplatform/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DaneService } from '../dane.service';

/** Fila tal como la devuelve el dataset `cfw5-qzt5`. */
const FILA = {
  a_o: '2025',
  codigo_dane: '147555000295',
  nombre_establecimiento: 'INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
  municipio: 'Plato',
  departamento: 'Magdalena',
  direccion: 'CALLE 6A CARRERA 15 ESQUINA',
  telefono: '3001234567',
  email: 'iedjuanaariasdebenavides@sedmagdalena.gov.co',
  calendario: 'A',
  sector: 'OFICIAL',
  caracter: 'Técnico/Academico',
  rector: 'ARMANDO JAIME DE ARCO CACERES',
  total_matricula: '3748',
  cantidad_sedes: '7',
};

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Cuerpo del error HTTP lanzado por el servicio (estrecha la unión ApiResponse). */
function cuerpoDe(error: unknown): { error: { code: string; message: string } } {
  const cuerpo = (error as HttpException).getResponse() as ApiResponse<never>;
  if (cuerpo.success || cuerpo.error === undefined) {
    throw new Error('Se esperaba un error y llegó una respuesta correcta');
  }
  return { error: cuerpo.error };
}

describe('DaneService', () => {
  let servicio: DaneService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    servicio = new DaneService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('normaliza la fila del MEN al contrato de la web', async () => {
    fetchMock.mockResolvedValue(json([FILA]));

    const datos = await servicio.buscar('147555000295');

    expect(datos).toMatchObject({
      codigoDane: '147555000295',
      anio: 2025,
      municipio: 'Plato',
      departamento: 'Magdalena',
      calendario: 'A',
      sector: 'OFICIAL',
      caracter: 'Técnico/Academico',
      matricula: 3748,
      sedes: 7,
    });
  });

  it('pide la fila más reciente con SoQL y filtra por código DANE', async () => {
    fetchMock.mockResolvedValue(json([FILA]));

    await servicio.buscar('147555000295');

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://www.datos.gov.co/resource/cfw5-qzt5.json');
    expect(url.searchParams.get('$where')).toBe('codigo_dane=147555000295');
    expect(url.searchParams.get('$order')).toBe('a_o DESC');
    expect(url.searchParams.get('$limit')).toBe('1');
  });

  it('queda en 404 cuando el código no existe', async () => {
    fetchMock.mockResolvedValue(json([]));

    const error = await servicio.buscar('147555000295').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(404);
    expect(cuerpoDe(error).error.code).toBe('NOT_FOUND');
  });

  it('trata un 403 de datos.gov.co como fallo de configuración, no como colegio inexistente', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Invalid app_token specified' }, 403));

    const error = await servicio.buscar('147555000295').catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(502);
    expect(cuerpoDe(error).error.code).toBe('INTERNAL_ERROR');
    // No se filtra al usuario que el problema es del token: es diagnóstico interno.
    expect(cuerpoDe(error).error.message).not.toMatch(/token/i);
  });

  it('queda en 502 si datos.gov.co no responde', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    const error = await servicio.buscar('147555000295').catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(502);
  });

  it('cachea el resultado: dos consultas del mismo código no repiten peticiones', async () => {
    fetchMock.mockResolvedValue(json([FILA]));

    await servicio.buscar('147555000295');
    await servicio.buscar('147555000295');

    // Dos por búsqueda (establecimiento y jornadas) y ninguna más la segunda vez.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propone las sedes del MEN con su nombre saneado, sus jornadas y su matrícula', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('ngw5-c5nw')
          ? json([
              // Principal (mismo DANE del colegio), dos jornadas.
              {
                anno_inf: '2025',
                codigo_dane_sede: '147555000295',
                nombre_sede: 'CENT EDUC JUANA ARIAS DE BENAVIDES',
                zona: 'Urbana',
                tipo_jornada: 'Mañana',
                matricula: '850',
              },
              {
                anno_inf: '2025',
                codigo_dane_sede: '147555000295',
                nombre_sede: 'CENT EDUC JUANA ARIAS DE BENAVIDES',
                zona: 'Urbana',
                tipo_jornada: 'Nocturna',
                matricula: '192',
              },
              {
                anno_inf: '2025',
                codigo_dane_sede: '247555001067',
                nombre_sede: 'ERM LOS POZOS',
                zona: 'Rural',
                tipo_jornada: 'Mañana',
                matricula: '47',
              },
            ])
          : json([FILA]),
      ),
    );

    const datos = await servicio.buscar('147555000295');

    expect(datos.sedesMen).toEqual([
      {
        codigoDaneSede: '147555000295',
        nombre: 'Juana Arias de Benavides',
        jornadas: ['MANANA', 'NOCTURNA'],
        zona: 'Urbana',
        matricula: 1042,
        esPrincipal: true,
      },
      {
        codigoDaneSede: '247555001067',
        nombre: 'Los Pozos',
        jornadas: ['MANANA'],
        zona: 'Rural',
        matricula: 47,
        esPrincipal: false,
      },
    ]);
    // Las jornadas del colegio salen de la unión de sus sedes, en orden de enum.
    expect(datos.jornadas).toEqual(['MANANA', 'NOCTURNA']);
  });

  it('descarta las sedes y jornadas de años anteriores', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('ngw5-c5nw')
          ? json([
              {
                anno_inf: '2025',
                codigo_dane_sede: '147555000295',
                nombre_sede: 'SAN JOSE',
                zona: 'Urbana',
                tipo_jornada: 'Tarde',
                matricula: '10',
              },
              // Sede que ya no aparece en el reporte vigente.
              {
                anno_inf: '2010',
                codigo_dane_sede: '247555009999',
                nombre_sede: 'ERM VIEJA',
                zona: 'Rural',
                tipo_jornada: 'Fin de Semana',
                matricula: '5',
              },
            ])
          : json([FILA]),
      ),
    );

    const datos = await servicio.buscar('147555000295');

    expect(datos.sedesMen.map((s) => s.codigoDaneSede)).toEqual(['147555000295']);
    expect(datos.jornadas).toEqual(['TARDE']);
  });

  it('pide las sedes agrupadas por año, sede y jornada, sin clavar el año', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('ngw5-c5nw')
          ? json([
              {
                anno_inf: '2025',
                codigo_dane_sede: '147555000295',
                nombre_sede: 'SAN JOSE',
                tipo_jornada: 'Mañana',
                matricula: '1',
              },
            ])
          : json([FILA]),
      ),
    );

    await servicio.buscar('147555000295');

    const urlSedes = fetchMock.mock.calls
      .map(([u]) => new URL(String(u)))
      .find((u) => u.pathname.includes('ngw5-c5nw'));
    // El año del establecimiento (2025) acota la consulta: dos vigencias.
    expect(urlSedes?.searchParams.get('$where')).toBe(
      'codigo_dane=147555000295 AND anno_inf >= 2024',
    );
    expect(urlSedes?.searchParams.get('$group')).toBe(
      'anno_inf,codigo_dane_sede,nombre_sede,zona,tipo_jornada',
    );
    expect(urlSedes?.searchParams.get('$order')).toBe('anno_inf DESC');
  });

  it('si el dataset de sedes falla, la búsqueda sigue y no propone ninguna', async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).includes('ngw5-c5nw')
        ? Promise.resolve(json({ message: 'boom' }, 500))
        : Promise.resolve(json([FILA])),
    );

    const datos = await servicio.buscar('147555000295');

    expect(datos.sedesMen).toEqual([]);
    expect(datos.jornadas).toEqual([]);
    expect(datos.codigoDane).toBe('147555000295');
  });

  it('se queda con la primera dirección si el campo email trae dos', async () => {
    fetchMock.mockResolvedValue(
      json([{ ...FILA, email: 'rectoria@x.edu.co secretaria@x.edu.co' }]),
    );

    const datos = await servicio.buscar('147555000295');

    expect(datos.email).toBe('rectoria@x.edu.co');
  });

  it('se queda con el primer teléfono si el campo trae dos', async () => {
    fetchMock.mockResolvedValue(json([{ ...FILA, telefono: '7422210/7422215' }]));

    const datos = await servicio.buscar('147555000295');

    expect(datos.telefono).toBe('7422210');
  });

  it('sin calendario reconocible asume calendario A', async () => {
    fetchMock.mockResolvedValue(json([{ ...FILA, calendario: undefined }]));

    const datos = await servicio.buscar('147555000295');

    expect(datos.calendario).toBe('A');
  });

  it('envía el app token cuando DATOS_GOV_APP_TOKEN está definido', async () => {
    vi.stubEnv('DATOS_GOV_APP_TOKEN', 'token-de-prueba-123456');
    vi.resetModules();
    const { DaneService: ServicioConToken } = await import('../dane.service');
    const conToken = new ServicioConToken();

    fetchMock.mockResolvedValue(json([FILA]));
    await conToken.buscar('147555000295');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>)['X-App-Token']).toBe('token-de-prueba-123456');
  });
});
