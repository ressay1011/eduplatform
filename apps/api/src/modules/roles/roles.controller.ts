/**
 * RolesController — /api/roles (roles del colegio, módulo Personas).
 * Leer exige `usuarios.ver`; crear/editar/borrar exige `configuracion.editar`.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ActualizarRolSchema,
  CrearRolSchema,
  ErrorCodes,
  type ActualizarRolRequest,
  type ApiResponse,
  type ListaRoles,
  type RolListado,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RolesService, type ActorRoles } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  private actor(auth: AuthContext): ActorRoles {
    if (auth.tipo !== 'colegio') {
      throw apiError(ErrorCodes.FORBIDDEN, 403, 'Este módulo es exclusivo de usuarios del colegio');
    }
    return { colegioId: auth.colegio.id, usuarioId: auth.usuario.id, esAdmin: auth.esAdmin };
  }

  /** Roles del colegio con permisos y número de personas asignadas. */
  @Get()
  @RequirePermission('usuarios.ver')
  async listar(@CurrentAuth() auth: AuthContext): Promise<ApiResponse<ListaRoles>> {
    return { success: true, data: await this.roles.listar(this.actor(auth)) };
  }

  /** Sedes para el selector de alcance (vacío si el colegio aún no tiene). */
  @Get('sedes')
  @RequirePermission('usuarios.ver')
  async sedes(
    @CurrentAuth() auth: AuthContext,
  ): Promise<ApiResponse<{ id: string; nombre: string }[]>> {
    return { success: true, data: await this.roles.sedes(this.actor(auth)) };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('configuracion.editar')
  async crear(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<RolListado>> {
    const dto = CrearRolSchema.parse(body);
    return { success: true, data: await this.roles.crear(this.actor(auth), dto) };
  }

  @Patch(':id')
  @RequirePermission('configuracion.editar')
  async actualizar(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<RolListado>> {
    const dto: ActualizarRolRequest = ActualizarRolSchema.parse(body);
    return { success: true, data: await this.roles.actualizar(this.actor(auth), id, dto) };
  }

  @Post(':id/duplicar')
  @HttpCode(201)
  @RequirePermission('configuracion.editar')
  async duplicar(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ApiResponse<RolListado>> {
    return { success: true, data: await this.roles.duplicar(this.actor(auth), id) };
  }

  @Delete(':id')
  @RequirePermission('configuracion.editar')
  async eliminar(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ApiResponse<{ id: string }>> {
    return { success: true, data: await this.roles.eliminar(this.actor(auth), id) };
  }
}