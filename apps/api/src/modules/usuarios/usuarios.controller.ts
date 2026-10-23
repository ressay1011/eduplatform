/**
 * UsuariosController — /api/usuarios (personal del colegio).
 * Todas las rutas exigen sesión de colegio + permiso granular (ADR-003).
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ActualizarUsuarioSchema,
  CrearUsuarioSchema,
  ErrorCodes,
  EstablecerPermisosSchema,
  ListarUsuariosQuerySchema,
  type ActualizarUsuarioRequest,
  type ApiResponse,
  type CrearUsuarioRequest,
  type EstablecerPermisosRequest,
  type ListaUsuarios,
  type PasswordRestablecida,
  type PermisoCatalogoItem,
  type UsuarioCreado,
  type UsuarioListado,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { UsuariosService, type ActorUsuarios } from './usuarios.service';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  /** S16 del informe: un id que no es UUID debe dar 400, no un 500 de Postgres. */
  private idValido(id: string): string {
    return z.string().uuid('Identificador inválido').parse(id);
  }

  /** El módulo es tenant-scoped: la consola de plataforma no lo usa. */
  private actor(auth: AuthContext): ActorUsuarios {
    if (auth.tipo !== 'colegio') {
      throw apiError(ErrorCodes.FORBIDDEN, 403, 'Este módulo es exclusivo de usuarios del colegio');
    }
    return { colegioId: auth.colegio.id, usuarioId: auth.usuario.id, esAdmin: auth.esAdmin };
  }

  /** Listado paginado con búsqueda y filtro por estado. */
  @Get()
  @RequirePermission('usuarios.ver')
  async listar(
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<ListaUsuarios>> {
    const filtros = ListarUsuariosQuerySchema.parse(query);
    const data = await this.usuarios.listar(this.actor(auth), filtros);
    return { success: true, data };
  }

  /** Catálogo de permisos para el editor (agrupado por módulo en la UI). */
  @Get('permisos')
  @RequirePermission('usuarios.ver')
  async catalogo(@CurrentAuth() auth: AuthContext): Promise<ApiResponse<PermisoCatalogoItem[]>> {
    const data = await this.usuarios.catalogo(this.actor(auth));
    return { success: true, data };
  }

  /** Detalle de un usuario (incluye permisos). */
  @Get(':id')
  @RequirePermission('usuarios.ver')
  async detalle(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ApiResponse<UsuarioListado>> {
    const data = await this.usuarios.detalle(this.actor(auth), this.idValido(id));
    return { success: true, data };
  }

  /** Crea la cuenta; devuelve la contraseña temporal UNA sola vez. */
  @Post()
  @HttpCode(201)
  @RequirePermission('usuarios.crear')
  async crear(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<ApiResponse<UsuarioCreado>> {
    const dto: CrearUsuarioRequest = CrearUsuarioSchema.parse(body);
    const data = await this.usuarios.crear(this.actor(auth), dto);
    return { success: true, data };
  }

  /** Edita datos personales y/o activa-desactiva la cuenta. */
  @Patch(':id')
  @RequirePermission('usuarios.editar')
  async actualizar(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<UsuarioListado>> {
    const dto: ActualizarUsuarioRequest = ActualizarUsuarioSchema.parse(body);
    const data = await this.usuarios.actualizar(this.actor(auth), this.idValido(id), dto);
    return { success: true, data };
  }

  /** Reemplaza el conjunto de permisos del usuario. */
  @Put(':id/permisos')
  @RequirePermission('usuarios.editar')
  async establecerPermisos(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ApiResponse<UsuarioListado>> {
    const dto: EstablecerPermisosRequest = EstablecerPermisosSchema.parse(body);
    const data = await this.usuarios.establecerPermisos(this.actor(auth), this.idValido(id), dto);
    return { success: true, data };
  }

  /** Nueva contraseña temporal + revocación de sesiones del usuario. */
  @Post(':id/reset-password')
  @HttpCode(200)
  @RequirePermission('usuarios.editar')
  async resetearPassword(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ApiResponse<PasswordRestablecida>> {
    const data = await this.usuarios.resetearPassword(this.actor(auth), this.idValido(id));
    return { success: true, data };
  }
}