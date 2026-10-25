/**
 * Cliente HTTP del web hacia la API de EduPlatform.
 * - `credentials: 'include'` → la cookie httpOnly de sesión viaja en cada request.
 * - Errores: ApiError con el contrato {success:false, error:{code,message}}.
 */
import type {
  ActualizarRolRequest,
  ActualizarUsuarioRequest,
  ApiResponse,
  ContextoColegioPublico,
  CrearRolRequest,
  CrearUsuarioRequest,
  ColegioOnboardingRequest,
  CrearMatriculaRequest,
  CursoMatricula,
  EstadoOnboarding,
  EstructuraOnboardingRequest,
  ImportarMatriculasRequest,
  ListaMatriculas,
  MatriculaCreada,
  ResultadoImportacionMatriculas,
  ResultadoOnboarding,
  SedeOnboardingRequest,
  ListaPersonas,
  ListaRoles,
  ListaUsuarios,
  LoginRequest,
  LoginResponse,
  MeResponse,
  PasswordRestablecida,
  PermisoCatalogoItem,
  PersonaAcudiente,
  PersonaEmpleado,
  PersonaEstudiante,
  RolListado,
  UsuarioCreado,
  UsuarioListado,
} from '@eduplatform/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/api';

/** Error de la API con el código estándar (ver ErrorCodes en @eduplatform/types). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

/** Extrae {code,message} del cuerpo de error (unknown → tipado, sin casts). */
function leerError(body: unknown): { code: string; message: string } | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const error: unknown = body.error;
  if (typeof error !== 'object' || error === null) return null;
  const code: unknown = Reflect.get(error, 'code');
  const message: unknown = Reflect.get(error, 'message');
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return { code, message };
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Timeout de 15s: un request colgado no debe dejar la UI en "cargando" eterno.
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controlador.signal,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'NETWORK_ERROR', 'La solicitud tardó demasiado. Intenta de nuevo.');
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No se pudo contactar el servidor. Verifica tu conexión.',
    );
  } finally {
    clearTimeout(temporizador);
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const error = leerError(json);
    throw new ApiError(
      res.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Error inesperado del servidor.',
    );
  }

  // SAFETY: el backend garantiza el contrato ApiResponse (probado e2e en la API).
  const envelope = json as ApiResponse<T> | null;
  if (envelope === null || envelope.data === undefined) {
    throw new ApiError(res.status, 'INTERNAL_ERROR', 'Respuesta inesperada del servidor.');
  }
  return envelope.data;
}

/** Contexto público + subdominio (respuesta del login unificado). */
export interface ContextoConSede extends ContextoColegioPublico {
  subdominio: string;
}

/** Branding público por subdominio (enlaces directos a un colegio). */
export function getContextoColegio(subdominio: string): Promise<ContextoColegioPublico> {
  return request(`/auth/contexto-colegio?subdominio=${encodeURIComponent(subdominio)}`);
}

/** Branding público por dominio de correo (la vía del login unificado). */
export function getContextoPorDominio(dominio: string): Promise<ContextoConSede> {
  return request(`/auth/contexto-colegio?dominio=${encodeURIComponent(dominio)}`);
}

/**
 * Paso 1 del login: la API resuelve el colegio por el dominio del correo.
 * 404 = ese dominio no pertenece a ningún colegio registrado.
 */
export function identificarColegio(email: string): Promise<ContextoConSede> {
  return request('/auth/identificar-colegio', { method: 'POST', body: { email } });
}

/** Login de usuario de colegio (guarda la cookie httpOnly). */
export function iniciarSesion(dto: LoginRequest): Promise<LoginResponse> {
  return request('/auth/login', { method: 'POST', body: dto });
}

/** Sesión activa (usuario, colegio, permisos). */
export function getSesion(): Promise<MeResponse> {
  return request('/auth/me');
}

/** Cierra la sesión en el servidor y limpia la cookie. */
export function cerrarSesion(): Promise<{ cerrada: boolean }> {
  return request('/auth/logout', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Usuarios del colegio (Personas → Usuarios)
// ---------------------------------------------------------------------------

/** Listado paginado (búsqueda por nombre/correo/documento y estado). */
export function listarUsuarios(params: {
  q?: string | undefined;
  estado?: 'todos' | 'activo' | 'inactivo';
  page?: number;
  limit?: number;
}): Promise<ListaUsuarios> {
  const query = new URLSearchParams();
  if (params.q !== undefined && params.q !== '') query.set('q', params.q);
  if (params.estado !== undefined) query.set('estado', params.estado);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const sufijo = query.toString();
  return request(`/usuarios${sufijo === '' ? '' : `?${sufijo}`}`);
}

/** Catálogo de permisos agrupable por módulo. */
export function catalogoPermisos(): Promise<PermisoCatalogoItem[]> {
  return request('/usuarios/permisos');
}

export function obtenerUsuario(id: string): Promise<UsuarioListado> {
  return request(`/usuarios/${encodeURIComponent(id)}`);
}

/** Crea la cuenta y devuelve la contraseña temporal (una sola vez). */
export function crearUsuario(dto: CrearUsuarioRequest): Promise<UsuarioCreado> {
  return request('/usuarios', { method: 'POST', body: dto });
}

export function actualizarUsuario(
  id: string,
  dto: ActualizarUsuarioRequest,
): Promise<UsuarioListado> {
  return request(`/usuarios/${encodeURIComponent(id)}`, { method: 'PATCH', body: dto });
}

export function establecerPermisos(id: string, permisos: string[]): Promise<UsuarioListado> {
  return request(`/usuarios/${encodeURIComponent(id)}/permisos`, {
    method: 'PUT',
    body: { permisos },
  });
}

/** Nueva contraseña temporal; revoca las sesiones del usuario. */
export function resetearPassword(id: string): Promise<PasswordRestablecida> {
  return request(`/usuarios/${encodeURIComponent(id)}/reset-password`, { method: 'POST' });
}

/** Cambio de contraseña (primer login forzado o cambio normal). */
export function cambiarPassword(dto: {
  passwordNueva: string;
  passwordActual?: string;
}): Promise<{ actualizada: boolean }> {
  return request('/auth/cambiar-password', { method: 'POST', body: dto });
}

// ---------------------------------------------------------------------------
// Personas → Roles
// ---------------------------------------------------------------------------

/** Roles del colegio con permisos y personas asignadas. */
export function listarRoles(): Promise<ListaRoles> {
  return request('/roles');
}

/** Sedes del colegio (selector de alcance). */
export function obtenerSedes(): Promise<{ id: string; nombre: string }[]> {
  return request('/roles/sedes');
}

export function crearRol(dto: CrearRolRequest): Promise<RolListado> {
  return request('/roles', { method: 'POST', body: dto });
}

export function actualizarRol(id: string, dto: ActualizarRolRequest): Promise<RolListado> {
  return request(`/roles/${encodeURIComponent(id)}`, { method: 'PATCH', body: dto });
}

export function duplicarRol(id: string): Promise<RolListado> {
  return request(`/roles/${encodeURIComponent(id)}/duplicar`, { method: 'POST' });
}

export function eliminarRol(id: string): Promise<{ id: string }> {
  return request(`/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Personas → listados (Empleados · Estudiantes · Acudientes)
// ---------------------------------------------------------------------------

function queryPersonas(params: { q?: string | undefined; page?: number; limit?: number }): string {
  const query = new URLSearchParams();
  if (params.q !== undefined && params.q !== '') query.set('q', params.q);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const sufijo = query.toString();
  return sufijo === '' ? '' : `?${sufijo}`;
}

export function listarEmpleados(params: {
  q?: string | undefined;
  page?: number;
  limit?: number;
}): Promise<ListaPersonas<PersonaEmpleado>> {
  return request(`/personas/empleados${queryPersonas(params)}`);
}

export function listarEstudiantes(params: {
  q?: string | undefined;
  page?: number;
  limit?: number;
}): Promise<ListaPersonas<PersonaEstudiante>> {
  return request(`/personas/estudiantes${queryPersonas(params)}`);
}

export function listarAcudientes(params: {
  q?: string | undefined;
  page?: number;
  limit?: number;
}): Promise<ListaPersonas<PersonaAcudiente>> {
  return request(`/personas/acudientes${queryPersonas(params)}`);
}

// ── Onboarding (configuración inicial del colegio) ───────────────────────────

/** Estado completo del wizard (una llamada alimenta los 6 pasos). */
export function getOnboarding(): Promise<EstadoOnboarding> {
  return request('/onboarding');
}

export function guardarColegioOnboarding(dto: ColegioOnboardingRequest): Promise<EstadoOnboarding> {
  return request('/onboarding/colegio', { method: 'PATCH', body: dto });
}

export function guardarSedeOnboarding(dto: SedeOnboardingRequest): Promise<EstadoOnboarding> {
  return request('/onboarding/sedes', { method: 'PUT', body: dto });
}

export function generarEstructuraOnboarding(
  dto: EstructuraOnboardingRequest,
): Promise<EstadoOnboarding> {
  return request('/onboarding/estructura', { method: 'POST', body: dto });
}

export function guardarPasoOnboarding(paso: number): Promise<EstadoOnboarding> {
  return request('/onboarding/paso', { method: 'PATCH', body: { paso } });
}

export function finalizarOnboarding(): Promise<ResultadoOnboarding> {
  return request('/onboarding/finalizar', { method: 'POST' });
}

// ── Matrículas ───────────────────────────────────────────────────────────────

/** Cursos del año vigente (resuelven las filas del CSV). */
export function listarCursosMatricula(): Promise<CursoMatricula[]> {
  return request('/matriculas/cursos');
}

/** Listado de matrículas, filtrable por curso y año. */
export function listarMatriculas(params: {
  cursoId?: string | undefined;
  anioLectivoId?: string | undefined;
  q?: string | undefined;
  page?: number;
  limit?: number;
}): Promise<ListaMatriculas> {
  const query = new URLSearchParams();
  if (params.cursoId !== undefined && params.cursoId !== '') query.set('cursoId', params.cursoId);
  if (params.anioLectivoId !== undefined && params.anioLectivoId !== '') {
    query.set('anioLectivoId', params.anioLectivoId);
  }
  if (params.q !== undefined && params.q !== '') query.set('q', params.q);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const sufijo = query.toString();
  return request(`/matriculas${sufijo === '' ? '' : `?${sufijo}`}`);
}

/** Alta individual (el estudiante debe existir en el colegio). */
export function crearMatricula(dto: CrearMatriculaRequest): Promise<MatriculaCreada> {
  return request('/matriculas', { method: 'POST', body: dto });
}

/** Importación del CSV: responde creadas + errores por fila. */
export function importarMatriculas(
  dto: ImportarMatriculasRequest,
): Promise<ResultadoImportacionMatriculas> {
  return request('/matriculas/importar', { method: 'POST', body: dto });
}

/** Baja lógica (estado RETIRADO). */
export function retirarMatricula(id: string): Promise<{ id: string }> {
  return request(`/matriculas/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
