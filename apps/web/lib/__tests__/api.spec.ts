/**
 * Tests del cliente HTTP — fetch mockeado (el contrato real de la API ya
 * está cubierto por los e2e de apps/api; aquí se valida el comportamiento
 * del cliente: contrato exitoso, errores con código y fallo de red).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  crearMatricula,
  getContextoColegio,
  importarMatriculas,
  iniciarSesion,
  listarCursosMatricula,
  listarMatriculas,
  listarUsuarios,
  retirarMatricula,
} from '../api';

const fetchMock = vi.fn();

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('lib/api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('devuelve data cuando la respuesta cumple el contrato', async () => {
    fetchMock.mockResolvedValue(
      respuesta(200, { success: true, data: { nombre: 'Colegio Norte' } }),
    );
    await expect(getContextoColegio('colegio-norte')).resolves.toEqual({ nombre: 'Colegio Norte' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/contexto-colegio?subdominio=colegio-norte'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('lanza ApiError con el código del contrato en 4xx', async () => {
    fetchMock.mockResolvedValue(
      respuesta(401, {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos' },
      }),
    );
    const fallo = await iniciarSesion({ email: 'a@b.co', password: 'x' }).catch(
      (err: unknown) => err,
    );
    expect(fallo).toBeInstanceOf(ApiError);
    expect(fallo).toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
  });

  it('el login unificado no envía header de subdominio (el colegio sale del correo)', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { success: true, data: { sessionToken: 't' } }));
    await iniciarSesion({
      email: 'a@colegio-sur.edu.co',
      password: 'Clave1234',
      rememberMe: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        body: JSON.stringify({
          email: 'a@colegio-sur.edu.co',
          password: 'Clave1234',
          rememberMe: false,
        }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('X-Colegio-Subdominio');
  });

  it('lanza NETWORK_ERROR si fetch rechaza (API caída)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const fallo = await getContextoColegio('demo').catch((err: unknown) => err);
    expect(fallo).toBeInstanceOf(ApiError);
    expect(fallo).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('lanza INTERNAL_ERROR si el cuerpo no cumple el contrato', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { raro: true }));
    const fallo = await getContextoColegio('demo').catch((err: unknown) => err);
    expect(fallo).toBeInstanceOf(ApiError);
    expect(fallo).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('listarUsuarios arma la query con búsqueda, estado y paginación', async () => {
    fetchMock.mockResolvedValue(
      respuesta(200, { success: true, data: { items: [], total: 0, page: 2, limit: 10 } }),
    );
    await listarUsuarios({ q: 'maría lópez', estado: 'activo', page: 2, limit: 10 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/usuarios?q=mar%C3%ADa+l%C3%B3pez&estado=activo&page=2&limit=10'),
      expect.anything(),
    );
  });

  describe('matrículas', () => {
    it('lista cursos y matrículas con sus filtros', async () => {
      fetchMock.mockImplementation(async () => respuesta(200, { success: true, data: [] }));
      await listarCursosMatricula();
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/matriculas/cursos'),
        expect.objectContaining({ method: 'GET' }),
      );

      fetchMock.mockImplementation(async () =>
        respuesta(200, { success: true, data: { items: [], total: 0, page: 1, limit: 50 } }),
      );
      await listarMatriculas({ cursoId: 'c1', anioLectivoId: 'a1', q: 'ana', page: 1, limit: 50 });
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/matriculas?cursoId=c1&anioLectivoId=a1&q=ana&page=1&limit=50'),
        expect.anything(),
      );

      // Sin filtros la ruta va limpia (no agrega `?`).
      await listarMatriculas({});
      expect(fetchMock.mock.calls.at(-1)?.[0]).toMatch(/\/matriculas$/);
    });

    it('crea, importa y retira con el método y el cuerpo correctos', async () => {
      fetchMock.mockResolvedValue(respuesta(201, { success: true, data: { id: 'm1' } }));
      await expect(crearMatricula({ estudianteId: 'e1', cursoId: 'c1' })).resolves.toEqual({
        id: 'm1',
      });
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/matriculas'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ estudianteId: 'e1', cursoId: 'c1' }),
        }),
      );

      fetchMock.mockResolvedValue(
        respuesta(200, { success: true, data: { creadas: 1, errores: [] } }),
      );
      const fila = {
        documento: '1098765432',
        sede: 'Sede Principal',
        grado: '6',
        letra: 'A',
        jornada: 'Mañana',
      };
      await expect(importarMatriculas({ filas: [fila] })).resolves.toEqual({
        creadas: 1,
        errores: [],
      });
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/matriculas/importar'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ filas: [fila] }),
        }),
      );

      fetchMock.mockResolvedValue(respuesta(200, { success: true, data: { id: 'm1' } }));
      await expect(retirarMatricula('m1')).resolves.toEqual({ id: 'm1' });
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/matriculas/m1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
