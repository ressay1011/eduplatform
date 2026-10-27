/**
 * OnboardingController — /api/onboarding (configuración inicial del colegio).
 *
 * Todo exige `configuracion.editar` y, además, ser admin del colegio: el
 * wizard crea sedes y cursos, no es una pantalla operativa más.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  CodigoDaneSchema,
  ColegioOnboardingSchema,
  ErrorCodes,
  EstructuraOnboardingSchema,
  SedeOnboardingSchema,
  type ApiResponse,
  type ColegioDane,
  type EstadoOnboarding,
  type ResultadoOnboarding,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { OnboardingService, type ActorOnboarding } from './onboarding.service';

const PasoSchema = z.object({ paso: z.number().int().min(1).max(6) });

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  private actor(auth: AuthContext): ActorOnboarding {
    if (auth.tipo !== 'colegio') {
      throw apiError(ErrorCodes.FORBIDDEN, 403, 'Este módulo es exclusivo de usuarios del colegio');
    }
    return {
      colegioId: auth.colegio.id,
      usuarioId: auth.usuario.id,
      email: auth.usuario.email,
      esAdmin: auth.esAdmin,
    };
  }

  /** Estado completo: colegio, sedes, año/períodos, conteos y checklist. */
  @Get()
  @RequirePermission('configuracion.editar')
  async estado(@CurrentAuth() auth: AuthContext): Promise<ApiResponse<EstadoOnboarding>> {
    return { success: true, data: await this.onboarding.estado(this.actor(auth)) };
  }

  /**
   * Paso 1: datos del establecimiento en los datos abiertos del MEN.
   * Es una SUGERENCIA para prellenar el formulario; el admin la revisa.
   */
  @Get('dane/:codigo')
  @RequirePermission('configuracion.editar')
  async dane(
    @CurrentAuth() auth: AuthContext,
    @Param('codigo') codigo: string,
  ): Promise<ApiResponse<ColegioDane>> {
    const codigoLimpio = CodigoDaneSchema.parse(codigo);
    return {
      success: true,
      data: await this.onboarding.buscarDane(this.actor(auth), codigoLimpio),
    };
  }

  /** Paso 1: identidad, calendario, año lectivo y períodos. */
  @Patch('colegio')
  @RequirePermission('configuracion.editar')
  async colegio(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<EstadoOnboarding>> {
    const dto = ColegioOnboardingSchema.parse(body);
    return { success: true, data: await this.onboarding.guardarColegio(this.actor(auth), dto) };
  }

  /** Paso 2: alta o edición de una sede con sus jornadas. */
  @Put('sedes')
  @RequirePermission('configuracion.editar')
  async sede(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<EstadoOnboarding>> {
    const dto = SedeOnboardingSchema.parse(body);
    return { success: true, data: await this.onboarding.guardarSede(this.actor(auth), dto) };
  }

  /** Paso 3: genera los cursos (grados × letras) de una sede y jornada. */
  @Post('estructura')
  @HttpCode(201)
  @RequirePermission('configuracion.editar')
  async estructura(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<EstadoOnboarding>> {
    const dto = EstructuraOnboardingSchema.parse(body);
    return { success: true, data: await this.onboarding.generarEstructura(this.actor(auth), dto) };
  }

  /** Paso 6: valida el mínimo y cierra el wizard. */
  @Post('finalizar')
  @HttpCode(200)
  @RequirePermission('configuracion.editar')
  async finalizar(@CurrentAuth() auth: AuthContext): Promise<ApiResponse<ResultadoOnboarding>> {
    const estado = await this.onboarding.finalizar(this.actor(auth));
    return { success: true, data: { completado: estado.completado, estado } };
  }

  /** «Guardar y salir»: recuerda el paso para reanudar. */
  @Patch('paso')
  @RequirePermission('configuracion.editar')
  async paso(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<EstadoOnboarding>> {
    const { paso } = PasoSchema.parse(body);
    return { success: true, data: await this.onboarding.guardarPaso(this.actor(auth), paso) };
  }
}
