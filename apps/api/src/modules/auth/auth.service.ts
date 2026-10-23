/**
 * AuthService — orquesta el ciclo de la sesión (login, logout, me, cambio
 * de contraseña). No conoce HTTP: recibe datos YA validados por el controller
 * y devuelve contratos de @eduplatform/types.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import {
  ErrorCodes,
  EstadoColegio,
  dominioDeEmail,
  type CambioPassword,
  type ContextoColegioPublico,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type PlataformaLoginRequest,
  type PlataformaLoginResponse,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import { AuditService } from '../../shared/audit.service';
import { platformTenantContext } from '../../shared/platform-context';
import {
  BLOQUEO_MINUTOS,
  HASH_SENUELO,
  MAX_INTENTOS_FALLIDOS,
  SESION_TTL_MS,
  SESION_TTL_RECORDAR_MS,
} from './auth.constants';
import { normalizarRolPlataforma, toLoginResponse, toMeResponse } from './auth.mapper';
import { AuthRepository, type ColegioPublicoRow } from './auth.repository';
import { ContextoCacheService } from './contexto-cache.service';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionTokenService } from './session-token.service';
import type {
  AuthContext,
  ColegioAuthContext,
  ContextoPublicoConSede,
  RequestMeta,
} from './auth.types';

/** Contexto tenant del usuario de colegio autenticado. */
function contextoDe(auth: ColegioAuthContext): TenantContext {
  return { colegioId: auth.colegio.id, isPlatformAdmin: false, userId: auth.usuario.id };
}

/** Normaliza el estado crudo de BD al enum del contrato. */
function normalizarEstadoColegio(valor: string): EstadoColegio {
  if (valor === EstadoColegio.ACTIVO) return EstadoColegio.ACTIVO;
  if (valor === EstadoColegio.SUSPENDIDO) return EstadoColegio.SUSPENDIDO;
  return EstadoColegio.PRUEBA;
}

/** Resultado del login: contrato + token/expiración para la cookie httpOnly. */
interface ResultadoLogin<T> {
  respuesta: T;
  token: string;
  expira: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: SessionTokenService,
    private readonly audit: AuditService,
    private readonly contextoCache: ContextoCacheService,
    private readonly attempts: LoginAttemptsService,
  ) {}

  /** Branding público del colegio para la pantalla de login (sin sesión). */
  async contextoColegio(subdominio: string): Promise<ContextoColegioPublico> {
    const clave = this.claveSubdominio(subdominio);
    const enCache = this.contextoCache.obtener(clave);
    if (enCache !== null) return enCache;

    const colegio = await this.repo.findColegioPublico(subdominio);
    if (colegio === null) {
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'No existe un colegio con ese subdominio');
    }
    const contexto = { ...this.aContextoPublico(colegio), subdominio: colegio.subdominio };
    this.contextoCache.guardar(clave, contexto);
    return contexto;
  }

  /**
   * Branding público por dominio de correo — la vía del login unificado.
   * Al guardar en caché se registran ambas llaves (dominio y subdominio) para
   * que la invalidación del módulo de colegios limpie todo de una vez.
   */
  async contextoColegioPorDominio(dominio: string): Promise<ContextoPublicoConSede> {
    const clave = this.claveDominio(dominio);
    const enCache = this.contextoCache.obtener(clave);
    if (enCache !== null) return enCache;

    const colegio = await this.repo.findColegioPublicoPorDominio(dominio);
    if (colegio === null) {
      throw apiError(
        ErrorCodes.NOT_FOUND,
        404,
        'No encontramos un colegio registrado con ese dominio de correo',
      );
    }
    const contexto = { ...this.aContextoPublico(colegio), subdominio: colegio.subdominio };
    this.contextoCache.guardar(clave, contexto);
    this.contextoCache.guardar(this.claveSubdominio(colegio.subdominio), contexto);
    return contexto;
  }

  /**
   * Paso 1 del login: solo el correo. El dominio (después de la @) identifica
   * el colegio y devuelve su branding. No revela si el usuario existe.
   */
  async identificarColegio(email: string): Promise<ContextoPublicoConSede> {
    const dominio = dominioDeEmail(email);
    if (dominio === null) {
      throw apiError(
        ErrorCodes.NOT_FOUND,
        404,
        'No encontramos un colegio registrado con ese dominio de correo',
      );
    }
    return this.contextoColegioPorDominio(dominio);
  }

  /** Convierte la fila de BD al contrato público (sin datos internos). */
  private aContextoPublico(colegio: ColegioPublicoRow): ContextoColegioPublico {
    return {
      nombre: colegio.nombre,
      codigoDane: colegio.codigoDane,
      logoUrl: colegio.logoUrl,
      primaryColor: colegio.primaryColor,
      municipio: colegio.municipio,
      departamento: colegio.departamento,
      estado: normalizarEstadoColegio(colegio.estado),
    };
  }

  private claveSubdominio(subdominio: string): string {
    return `subdominio:${subdominio}`;
  }

  private claveDominio(dominio: string): string {
    return `dominio:${dominio}`;
  }

  /**
   * Invalida la caché del contexto público de un colegio. Lo llamará el
   * módulo de colegios al editar (nombre, color, logo, dominio, estado): el
   * cambio se refleja en la siguiente carga, SIN esperar al TTL del caché.
   */
  invalidarContextoColegio(colegio: { subdominio: string; dominioEmail: string | null }): void {
    this.contextoCache.invalidar(this.claveSubdominio(colegio.subdominio));
    if (colegio.dominioEmail !== null) {
      this.contextoCache.invalidar(this.claveDominio(colegio.dominioEmail));
    }
  }

  /**
   * Login de usuario de colegio. El tenant se resuelve por el DOMINIO del
   * correo (login unificado): todos los colegios entran por la misma pantalla.
   */
  async login(dto: LoginRequest, meta: RequestMeta): Promise<ResultadoLogin<LoginResponse>> {
    // Bloqueo por identificador (correo): aplica exista o NO la cuenta, para
    // que un ataque de diccionario contra correos inventados también se frene.
    if (this.attempts.estaBloqueado(dto.email)) {
      throw apiError(
        ErrorCodes.ACCOUNT_LOCKED,
        423,
        'Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo más tarde.',
      );
    }

    const dominio = dominioDeEmail(dto.email);
    const colegioPublico =
      dominio === null ? null : await this.repo.findColegioPublicoPorDominio(dominio);
    if (colegioPublico === null) {
      // Mensaje genérico: no se revela si el dominio o el correo existen.
      this.attempts.registrarFallo(dto.email);
      throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'Correo o contraseña incorrectos');
    }
    if (colegioPublico.estado === EstadoColegio.SUSPENDIDO) {
      throw apiError(
        ErrorCodes.TENANT_INACTIVE,
        403,
        'El colegio está suspendido. Contacta a soporte.',
      );
    }

    const ctx: TenantContext = { colegioId: colegioPublico.id, isPlatformAdmin: false };
    const usuario = await this.repo.findUsuarioPorEmail(ctx, dto.email);
    if (usuario === null) {
      // Comparación contra un hash señuelo: mismo coste que una cuenta real.
      await this.passwords.verify(dto.password, HASH_SENUELO);
      await this.audit.registrar({
        accion: 'LOGIN_FAILED',
        entidad: 'auth',
        colegioId: ctx.colegioId,
        metadata: { ...meta, motivo: 'usuario inexistente' },
      });
      this.attempts.registrarFallo(dto.email);
      throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'Correo o contraseña incorrectos');
    }
    if (!usuario.activo) {
      // Misma respuesta que una clave errada: no revela que la cuenta existe.
      await this.passwords.verify(dto.password, HASH_SENUELO);
      await this.audit.registrar({
        accion: 'LOGIN_FAILED',
        entidad: 'auth',
        colegioId: ctx.colegioId,
        usuarioId: usuario.id,
        metadata: { ...meta, motivo: 'usuario desactivado' },
      });
      this.attempts.registrarFallo(dto.email);
      throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'Correo o contraseña incorrectos');
    }
    if (usuario.bloqueadoHasta !== null && usuario.bloqueadoHasta.getTime() > Date.now()) {
      await this.audit.registrar({
        accion: 'LOGIN_FAILED',
        entidad: 'auth',
        colegioId: ctx.colegioId,
        usuarioId: usuario.id,
        metadata: { ...meta, motivo: 'cuenta bloqueada en BD' },
      });
      this.attempts.registrarFallo(dto.email);
      throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'Correo o contraseña incorrectos');
    }

    const passwordOk = await this.passwords.verify(dto.password, usuario.passwordHash);
    if (!passwordOk) {
      const intentos = usuario.intentosFallidos + 1;
      const bloqueadoHasta =
        intentos >= MAX_INTENTOS_FALLIDOS ? new Date(Date.now() + BLOQUEO_MINUTOS * 60_000) : null;
      await this.repo.registrarLoginFallido(ctx, usuario.id, intentos, bloqueadoHasta);
      this.attempts.registrarFallo(dto.email);
      await this.audit.registrar({
        accion: 'LOGIN_FAILED',
        entidad: 'auth',
        colegioId: ctx.colegioId,
        usuarioId: usuario.id,
        metadata: { ...meta, motivo: 'contraseña incorrecta' },
      });
      throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'Correo o contraseña incorrectos');
    }

    const colegio = await this.repo.findColegioPorId(ctx);
    if (colegio === null) {
      throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'Correo o contraseña incorrectos');
    }

    await this.repo.registrarLoginExitoso(ctx, usuario.id);
    this.attempts.limpiar(dto.email);
    const token = this.tokens.generar();
    const expira = new Date(Date.now() + (dto.rememberMe ? SESION_TTL_RECORDAR_MS : SESION_TTL_MS));
    await this.repo.crearSesionUsuario(ctx, {
      usuarioId: usuario.id,
      tokenHash: this.tokens.hash(token),
      expiraEn: expira,
      ...meta,
    });
    await this.audit.registrar({
      accion: 'LOGIN',
      entidad: 'auth',
      colegioId: ctx.colegioId,
      usuarioId: usuario.id,
      metadata: meta,
    });
    this.logger.log(`Login correcto: usuario ${usuario.id} (colegio ${ctx.colegioId})`);
    return { respuesta: toLoginResponse(usuario, colegio), token, expira };
  }

  /** Login del nivel plataforma (equipo SaaS, sin subdominio). */
  async loginPlataforma(
    dto: PlataformaLoginRequest,
    meta: RequestMeta,
  ): Promise<ResultadoLogin<PlataformaLoginResponse>> {
    // Mismo bloqueo por identificador que el login de colegio (anti-diccionario).
    if (this.attempts.estaBloqueado(dto.email)) {
      throw apiError(
        ErrorCodes.ACCOUNT_LOCKED,
        423,
        'Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo más tarde.',
      );
    }

    const ctx = platformTenantContext();
    const usuario = await this.repo.findPlataformaUsuarioPorEmail(ctx, dto.email);
    if (usuario === null || !usuario.activo) {
      // Mismo coste y mismo mensaje que una clave errada (anti-enumeración).
      await this.passwords.verify(dto.password, HASH_SENUELO);
      await this.audit.registrar({
        accion: 'LOGIN_FAILED',
        entidad: 'auth.plataforma',
        metadata: { ...meta, motivo: 'usuario de plataforma inexistente o inactivo' },
      });
      this.attempts.registrarFallo(dto.email);
      throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'Correo o contraseña incorrectos');
    }

    const passwordOk = await this.passwords.verify(dto.password, usuario.passwordHash);
    if (!passwordOk) {
      await this.audit.registrar({
        accion: 'LOGIN_FAILED',
        entidad: 'auth.plataforma',
        entidadId: usuario.id,
        metadata: { ...meta, motivo: 'contraseña incorrecta' },
      });
      this.attempts.registrarFallo(dto.email);
      throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'Correo o contraseña incorrectos');
    }

    this.attempts.limpiar(dto.email);
    const token = this.tokens.generar();
    const expira = new Date(Date.now() + SESION_TTL_MS);
    await this.repo.crearSesionPlataforma(ctx, {
      plataformaUsuarioId: usuario.id,
      tokenHash: this.tokens.hash(token),
      expiraEn: expira,
      ...meta,
    });
    await this.audit.registrar({
      accion: 'LOGIN',
      entidad: 'auth.plataforma',
      entidadId: usuario.id,
      metadata: meta,
    });
    return {
      respuesta: {
        plataformaUsuario: {
          id: usuario.id,
          email: usuario.email,
          nombreCompleto: usuario.nombreCompleto,
          rol: normalizarRolPlataforma(usuario.rol),
        },
      },
      token,
      expira,
    };
  }

  /** Datos de la sesión activa (el contexto ya está cargado por el guard). */
  me(auth: AuthContext): MeResponse {
    return toMeResponse(auth);
  }

  /** Cierra la sesión: la revoca en BD y audita. */
  async logout(auth: AuthContext, meta: RequestMeta): Promise<void> {
    if (auth.tipo === 'colegio') {
      await this.repo.revocarSesionColegio(contextoDe(auth), auth.sesionId);
      await this.audit.registrar({
        accion: 'LOGOUT',
        entidad: 'auth',
        colegioId: auth.colegio.id,
        usuarioId: auth.usuario.id,
        metadata: meta,
      });
      return;
    }
    await this.repo.revocarSesionPlataforma(platformTenantContext(), auth.sesionId);
    await this.audit.registrar({
      accion: 'LOGOUT',
      entidad: 'auth.plataforma',
      entidadId: auth.plataformaUsuario.id,
      metadata: meta,
    });
  }

  /**
   * Cambio de contraseña. La contraseña actual es OBLIGATORIA salvo en el
   * primer login forzado (debeCambiarPassword = true). Revoca las demás
   * sesiones activas por seguridad.
   */
  async cambiarPassword(auth: AuthContext, dto: CambioPassword): Promise<void> {
    if (auth.tipo !== 'colegio') {
      throw apiError(
        ErrorCodes.FORBIDDEN,
        403,
        'El cambio de contraseña no está disponible para usuarios de plataforma',
      );
    }
    const ctx = contextoDe(auth);
    if (dto.passwordActual === undefined && !auth.usuario.debeCambiarPassword) {
      throw apiError(ErrorCodes.VALIDATION_ERROR, 400, 'Debes indicar tu contraseña actual');
    }
    if (dto.passwordActual !== undefined) {
      const usuario = await this.repo.findUsuarioPorId(ctx, auth.usuario.id);
      if (usuario === null) {
        throw apiError(ErrorCodes.UNAUTHORIZED, 401, 'Sesión inválida');
      }
      const actualOk = await this.passwords.verify(dto.passwordActual, usuario.passwordHash);
      if (!actualOk) {
        throw apiError(ErrorCodes.INVALID_CREDENTIALS, 401, 'La contraseña actual no es correcta');
      }
    }

    const passwordHash = await this.passwords.hash(dto.passwordNueva);
    await this.repo.actualizarPassword(ctx, auth.usuario.id, passwordHash);
    await this.repo.revocarSesionesDeUsuario(ctx, auth.usuario.id, auth.sesionId);
    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'usuarios',
      entidadId: auth.usuario.id,
      colegioId: auth.colegio.id,
      usuarioId: auth.usuario.id,
      metadata: { motivo: 'cambio de contraseña' },
    });
  }
}
