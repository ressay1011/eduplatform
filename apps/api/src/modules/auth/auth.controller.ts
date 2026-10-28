/**
 * AuthController — capa HTTP del auth (SIN lógica de negocio).
 * Rutas públicas: contexto-colegio, login, login-plataforma.
 * Rutas con sesión: logout, me, cambiar-password.
 * Rate limiting: global (100/min por IP) + estricto en los login (10/min).
 */
import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import {
  CambioPasswordSchema,
  DominioEmailSchema,
  IdentificarColegioRequestSchema,
  LoginRequestSchema,
  PlataformaLoginRequestSchema,
  SubdominioSchema,
  type ApiResponse,
  type ContextoColegioPublico,
  type LoginResponse,
  type MeResponse,
  type PlataformaLoginResponse,
} from '@eduplatform/types';
import { env } from '../../config/env';
import type {
  AuthContext,
  AuthenticatedRequest,
  ContextoPublicoConSede,
  RequestMeta,
} from './auth.types';
import { SESION_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import { CurrentAuth } from './decorators/current-auth.decorator';
import { Public } from './decorators/public.decorator';

const THROTTLE_TTL_MS = 60_000;

/** ETag fuerte del payload (sha256 en base64) para revalidación con 304. */
function calcularEtag(data: ContextoColegioPublico): string {
  return `"${createHash('sha256').update(JSON.stringify(data)).digest('base64')}"`;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Branding público del colegio para la pantalla de login (sin sesión).
   * Respuesta cacheada en memoria (API) + `Cache-Control: no-cache` + ETag:
   * el navegador SIEMPRE revalida y recibe 304 si nada cambió — así un cambio
   * de color/invalidación se ve de inmediato, sin ventanas de 60s de stale.
   */
  @Public()
  @Throttle({ default: { limit: env.THROTTLE_LOGIN_LIMIT, ttl: THROTTLE_TTL_MS } })
  @Get('contexto-colegio')
  async contextoColegio(
    @Query('subdominio') subdominio: string | undefined,
    @Query('dominio') dominio: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    // Dos vías: `dominio` (login unificado) o `subdominio` (enlaces por colegio).
    const data =
      dominio !== undefined && dominio !== ''
        ? await this.authService.contextoColegioPorDominio(DominioEmailSchema.parse(dominio))
        : await this.authService.contextoColegio(SubdominioSchema.parse(subdominio));
    const etag = calcularEtag(data);

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);

    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string') {
      const etiquetas = ifNoneMatch.split(',').map((v) => v.trim());
      if (etiquetas.includes(etag) || etiquetas.includes('*')) {
        res.status(304).end();
        return;
      }
    }

    const cuerpo: ApiResponse<ContextoColegioPublico> = { success: true, data };
    res.status(200).json(cuerpo);
  }

  /**
   * Login de usuario de colegio. El colegio viene en `subdominio` (la web lo
   * saca del host) o, si no, en el header `X-Colegio-Subdominio`; sin ninguno
   * de los dos se usa la vía heredada por dominio del identificador.
   */
  @Public()
  @Throttle({ default: { limit: env.THROTTLE_LOGIN_LIMIT, ttl: THROTTLE_TTL_MS } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<LoginResponse>> {
    const dto = LoginRequestSchema.parse(body);
    const header = req.headers['x-colegio-subdominio'];
    const subdominioHeader = Array.isArray(header) ? header[0] : header;
    const subdominio =
      dto.subdominio ??
      (subdominioHeader !== undefined && subdominioHeader !== ''
        ? SubdominioSchema.parse(subdominioHeader)
        : undefined);

    const { respuesta, token, expira } = await this.authService.login(
      { ...dto, subdominio },
      metaDeRequest(req),
    );
    this.setCookieSesion(res, token, expira);
    return { success: true, data: respuesta };
  }

  /**
   * Paso 1 del login unificado: recibe SOLO el correo y resuelve el colegio
   * por el dominio (lo que va después de la @). Devuelve el branding público.
   * Mismo límite estricto que el login: evita enumerar dominios a fuerza bruta.
   */
  @Public()
  @Throttle({ default: { limit: env.THROTTLE_LOGIN_LIMIT, ttl: THROTTLE_TTL_MS } })
  @Post('identificar-colegio')
  @HttpCode(200)
  async identificarColegio(@Body() body: unknown): Promise<ApiResponse<ContextoPublicoConSede>> {
    const dto = IdentificarColegioRequestSchema.parse(body);
    const data = await this.authService.identificarColegio(dto.usuario);
    return { success: true, data };
  }

  /** Login del nivel plataforma (equipo SaaS, sin subdominio). */
  @Public()
  @Throttle({ default: { limit: env.THROTTLE_LOGIN_LIMIT, ttl: THROTTLE_TTL_MS } })
  @Post('login-plataforma')
  @HttpCode(200)
  async loginPlataforma(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<PlataformaLoginResponse>> {
    const dto = PlataformaLoginRequestSchema.parse(body);
    const { respuesta, token, expira } = await this.authService.loginPlataforma(
      dto,
      metaDeRequest(req),
    );
    this.setCookieSesion(res, token, expira);
    return { success: true, data: respuesta };
  }

  /** Cierra la sesión actual (revoca en BD + limpia cookie). */
  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<{ cerrada: boolean }>> {
    await this.authService.logout(auth, metaDeRequest(req));
    res.clearCookie(SESION_COOKIE, { path: '/' });
    return { success: true, data: { cerrada: true } };
  }

  /** Datos de la sesión activa (usuario, colegio, permisos). */
  @Get('me')
  me(@CurrentAuth() auth: AuthContext): ApiResponse<MeResponse> {
    return { success: true, data: this.authService.me(auth) };
  }

  /** Cambio de contraseña (primer login forzado o cambio normal). */
  @Throttle({ default: { limit: 5, ttl: THROTTLE_TTL_MS } })
  @Post('cambiar-password')
  @HttpCode(200)
  async cambiarPassword(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<{ actualizada: boolean }>> {
    const dto = CambioPasswordSchema.parse(body);
    await this.authService.cambiarPassword(auth, dto);
    return { success: true, data: { actualizada: true } };
  }

  /** Cookie httpOnly de sesión (secure salvo en desarrollo). */
  private setCookieSesion(res: Response, token: string, expira: Date): void {
    res.cookie(SESION_COOKIE, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
      sameSite: env.COOKIE_SAMESITE,
      path: '/',
      expires: expira,
    });
  }
}

/** Metadatos de la request para auditoría (IP y user-agent). */
function metaDeRequest(req: AuthenticatedRequest): RequestMeta {
  const userAgent = req.headers['user-agent'];
  return {
    ...(req.ip !== undefined && req.ip !== '' ? { ip: req.ip } : {}),
    ...(typeof userAgent === 'string' && userAgent !== '' ? { userAgent } : {}),
  };
}
