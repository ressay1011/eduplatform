/**
 * MatriculasController — /api/matriculas.
 *
 * Lecturas con `estudiantes.ver`; escrituras con `matriculas.administrar`
 * (el catálogo de permisos ya define esa acción para Secretaría y el admin).
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CrearMatriculaSchema,
  ErrorCodes,
  ImportarMatriculasSchema,
  ListarMatriculasQuerySchema,
  type ApiResponse,
  type CrearMatriculaDatos,
  type CursoMatricula,
  type ImportarMatriculasRequest,
  type ListaMatriculas,
  type MatriculaCreada,
  type ResultadoImportacionMatriculas,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { MatriculasService, type ActorMatriculas } from './matriculas.service';

@Controller('matriculas')
export class MatriculasController {
  constructor(private readonly matriculas: MatriculasService) {}

  private actor(auth: AuthContext): ActorMatriculas {
    if (auth.tipo !== 'colegio') {
      throw apiError(ErrorCodes.FORBIDDEN, 403, 'Este módulo es exclusivo de usuarios del colegio');
    }
    return { colegioId: auth.colegio.id, usuarioId: auth.usuario.id };
  }

  /** Cursos resolubles del año vigente (vista previa del CSV). */
  @Get('cursos')
  @RequirePermission('estudiantes.ver')
  async cursos(@CurrentAuth() auth: AuthContext): Promise<ApiResponse<CursoMatricula[]>> {
    return { success: true, data: await this.matriculas.cursos(this.actor(auth)) };
  }

  /** Listado filtrable por curso y año lectivo. */
  @Get()
  @RequirePermission('estudiantes.ver')
  async listar(
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<ListaMatriculas>> {
    const filtros = ListarMatriculasQuerySchema.parse(query);
    return { success: true, data: await this.matriculas.listar(this.actor(auth), filtros) };
  }

  /** Alta individual de un estudiante existente. */
  @Post()
  @HttpCode(201)
  @RequirePermission('matriculas.administrar')
  async crear(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<MatriculaCreada>> {
    const dto: CrearMatriculaDatos = CrearMatriculaSchema.parse(body);
    return { success: true, data: await this.matriculas.crear(this.actor(auth), dto) };
  }

  /** Importación del CSV del onboarding; responde creadas + errores por fila. */
  @Post('importar')
  @HttpCode(200)
  @RequirePermission('matriculas.administrar')
  async importar(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<ResultadoImportacionMatriculas>> {
    const dto: ImportarMatriculasRequest = ImportarMatriculasSchema.parse(body);
    return { success: true, data: await this.matriculas.importar(this.actor(auth), dto) };
  }

  /** Baja lógica (estado RETIRADO). */
  @Delete(':id')
  @RequirePermission('matriculas.administrar')
  async retirar(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ApiResponse<{ id: string }>> {
    const matriculaId = z.string().uuid('Identificador inválido').parse(id);
    return { success: true, data: await this.matriculas.retirar(this.actor(auth), matriculaId) };
  }
}
