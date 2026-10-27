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

  it('cachea el resultado: dos consultas del mismo código hacen una sola petición', async () => {
    fetchMock.mockResolvedValue(json([FILA]));

    await servicio.buscar('147555000295');
    await servicio.buscar('147555000295');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('se queda con la primera dirección si el campo email trae dos', async () => {
    fetchMock.mockResolvedValue(
      json([{ ...FILA, email: 'rectoria@x.edu.co secretaria@x.edu.co' }]),
    );

    const datos = await servicio.buscar('147555000295');

    expect(datos.email).toBe('rectoria@x.edu.co');
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
