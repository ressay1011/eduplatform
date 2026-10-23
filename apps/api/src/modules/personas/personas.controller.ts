/**
 * PersonasController — /api/personas (pestañas del módulo Personas).
 * Listados de solo lectura; cada pestaña exige el permiso de su dominio.
 */
import { Controller, Get, Query } from '@nestjs/common';
import {
  ErrorCodes,
  ListarPersonasQuerySchema,
  type ApiResponse,
  type ListaPersonas,
  type ListarPersonasQuery,
  type PersonaAcudiente,
  type PersonaEmpleado,
  type PersonaEstudiante,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PersonasService, type ActorPersonas } from './personas.service';

@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  private actor(auth: AuthContext): ActorPersonas {
    if (auth.tipo !== 'colegio') {
      throw apiError(ErrorCodes.FORBIDDEN, 403, 'Este módulo es exclusivo de usuarios del colegio');
    }
    return { colegioId: auth.colegio.id, usuarioId: auth.usuario.id };
  }

  /** Conteos de las tres pestañas (tarjetas del encabezado). */
  @Get('resumen')
  @RequirePermission('usuarios.ver')
  async resumen(
    @CurrentAuth() auth: AuthContext,
  ): Promise<ApiResponse<{ empleados: number; estudiantes: number; acudientes: number }>> {
    return { success: true, data: await this.personas.resumen(this.actor(auth)) };
  }

  @Get('empleados')
  @RequirePermission('usuarios.ver')
  async empleados(
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<ListaPersonas<PersonaEmpleado>>> {
    const filtros: ListarPersonasQuery = ListarPersonasQuerySchema.parse(query);
    return { success: true, data: await this.personas.empleados(this.actor(auth), filtros) };
  }

  @Get('estudiantes')
  @RequirePermission('estudiantes.ver')
  async estudiantes(
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<ListaPersonas<PersonaEstudiante>>> {
    const filtros: ListarPersonasQuery = ListarPersonasQuerySchema.parse(query);
    return { success: true, data: await this.personas.estudiantes(this.actor(auth), filtros) };
  }

  @Get('acudientes')
  @RequirePermission('usuarios.ver')
  async acudientes(
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<ListaPersonas<PersonaAcudiente>>> {
    const filtros: ListarPersonasQuery = ListarPersonasQuerySchema.parse(query);
    return { success: true, data: await this.personas.acudientes(this.actor(auth), filtros) };
  }
}