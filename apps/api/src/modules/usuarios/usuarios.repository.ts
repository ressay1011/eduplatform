/**
 * UsuariosRepository — acceso a datos del módulo Usuarios.
 * Todo corre con `withTenant` (RLS + filtro explícito por colegio_id) y sin
 * lanzar HttpException: el service decide los status.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import { and, asc, count, eq, ilike, inArray, isNull, ne, or } from 'drizzle-orm';
import {
  permisos,
  roles,
  sesiones,
  sedes,
  usuarios,
  usuariosPermisos,
  usuariosSedes,
} from '@eduplatform/database';
import type { ListarUsuariosQuery, PermisoCatalogoItem, TipoDocumento } from '@eduplatform/types';
import { BaseRepository } from '../../shared/base.repository';

/** Fila de usuario con las columnas que expone la API. */
export interface UsuarioRow {
  id: string;
  colegioId: string;
  nombres: string | null;
  apellidos: string | null;
  usuario: string;
  tipoDocumento: TipoDocumento | null;
  numeroDocumento: string | null;
  esAdmin: boolean;
  rolId: string | null;
  alcance: 'TODAS' | 'ESPECIFICAS';
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: Date | null;
}

const USUARIO_COLUMNS = {
  id: usuarios.id,
  colegioId: usuarios.colegioId,
  nombres: usuarios.nombres,
  apellidos: usuarios.apellidos,
  usuario: usuarios.usuario,
  tipoDocumento: usuarios.tipoDocumento,
  numeroDocumento: usuarios.numeroDocumento,
  esAdmin: usuarios.esAdmin,
  rolId: usuarios.rolId,
  alcance: usuarios.alcance,
  activo: usuarios.activo,
  debeCambiarPassword: usuarios.debeCambiarPassword,
  ultimoAcceso: usuarios.ultimoAcceso,
} as const;

@Injectable()
export class UsuariosRepository extends BaseRepository {
  /** Página de usuarios + total (búsqueda por nombre, correo o documento). */
  async listar(
    ctx: TenantContext,
    filtros: ListarUsuariosQuery & {
      page: number;
      limit: number;
      estado: 'todos' | 'activo' | 'inactivo';
    },
  ): Promise<{ filas: UsuarioRow[]; total: number }> {
    return this.withTenant(ctx, async (tx) => {
      const condiciones = [eq(usuarios.colegioId, ctx.colegioId), isNull(usuarios.deletedAt)];
      if (filtros.q !== undefined && filtros.q !== '') {
        const patron = `%${filtros.q}%`;
        const busqueda = or(
          ilike(usuarios.nombres, patron),
          ilike(usuarios.apellidos, patron),
          ilike(usuarios.usuario, patron),
          ilike(usuarios.numeroDocumento, patron),
        );
        if (busqueda !== undefined) condiciones.push(busqueda);
      }
      if (filtros.estado !== 'todos') {
        condiciones.push(eq(usuarios.activo, filtros.estado === 'activo'));
      }
      const where = and(...condiciones);

      const totales = await tx.select({ total: count() }).from(usuarios).where(where);
      const filas = await tx
        .select(USUARIO_COLUMNS)
        .from(usuarios)
        .where(where)
        .orderBy(asc(usuarios.apellidos), asc(usuarios.nombres))
        .limit(filtros.limit)
        .offset((filtros.page - 1) * filtros.limit);

      return { filas, total: Number(totales[0]?.total ?? 0) };
    });
  }

  /** Códigos de permiso por usuario (solo para los ids pedidos). */
  async permisosPorUsuario(
    ctx: TenantContext,
    ids: readonly string[],
  ): Promise<Map<string, string[]>> {
    const mapa = new Map<string, string[]>();
    if (ids.length === 0) return mapa;

    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select({ usuarioId: usuariosPermisos.usuarioId, codigo: permisos.codigo })
        .from(usuariosPermisos)
        .innerJoin(permisos, eq(permisos.id, usuariosPermisos.permisoId))
        .where(
          and(
            eq(usuariosPermisos.colegioId, ctx.colegioId),
            inArray(usuariosPermisos.usuarioId, [...ids]),
          ),
        );
      for (const fila of filas) {
        const actuales = mapa.get(fila.usuarioId) ?? [];
        actuales.push(fila.codigo);
        mapa.set(fila.usuarioId, actuales);
      }
      return mapa;
    });
  }

  async findPorId(ctx: TenantContext, id: string): Promise<UsuarioRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(USUARIO_COLUMNS)
        .from(usuarios)
        .where(
          and(
            eq(usuarios.id, id),
            eq(usuarios.colegioId, ctx.colegioId),
            isNull(usuarios.deletedAt),
          ),
        )
        .limit(1);
      return filas[0] ?? null;
    });
  }

  async findPorUsuario(ctx: TenantContext, usuario: string): Promise<UsuarioRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(USUARIO_COLUMNS)
        .from(usuarios)
        .where(
          and(
            eq(usuarios.usuario, usuario.toLowerCase()),
            eq(usuarios.colegioId, ctx.colegioId),
            isNull(usuarios.deletedAt),
          ),
        )
        .limit(1);
      return filas[0] ?? null;
    });
  }

  async findPorDocumento(
    ctx: TenantContext,
    tipoDocumento: TipoDocumento,
    numeroDocumento: string,
  ): Promise<UsuarioRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(USUARIO_COLUMNS)
        .from(usuarios)
        .where(
          and(
            eq(usuarios.colegioId, ctx.colegioId),
            eq(usuarios.tipoDocumento, tipoDocumento),
            eq(usuarios.numeroDocumento, numeroDocumento),
            isNull(usuarios.deletedAt),
          ),
        )
        .limit(1);
      return filas[0] ?? null;
    });
  }

  /** ¿Otro usuario (distinto de `exceptoId`) ya usa ese usuario/documento? */
  async existeUsuario(ctx: TenantContext, usuario: string, exceptoId?: string): Promise<boolean> {
    return this.withTenant(ctx, async (tx) => {
      const condiciones = [
        eq(usuarios.colegioId, ctx.colegioId),
        eq(usuarios.usuario, usuario.toLowerCase()),
        isNull(usuarios.deletedAt),
      ];
      if (exceptoId !== undefined) condiciones.push(ne(usuarios.id, exceptoId));
      const filas = await tx
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(and(...condiciones))
        .limit(1);
      return filas.length > 0;
    });
  }

  async cuentaAdminsActivos(ctx: TenantContext): Promise<number> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select({ total: count() })
        .from(usuarios)
        .where(
          and(
            eq(usuarios.colegioId, ctx.colegioId),
            eq(usuarios.esAdmin, true),
            eq(usuarios.activo, true),
            isNull(usuarios.deletedAt),
          ),
        );
      return Number(filas[0]?.total ?? 0);
    });
  }

  async crear(
    ctx: TenantContext,
    valores: {
      usuario: string;
      passwordHash: string;
      nombres: string;
      apellidos: string;
      tipoDocumento: TipoDocumento;
      numeroDocumento: string;
      esAdmin: boolean;
      rolId: string | null;
      alcance: 'TODAS' | 'ESPECIFICAS';
    },
  ): Promise<UsuarioRow> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .insert(usuarios)
        .values({
          colegioId: ctx.colegioId,
          usuario: valores.usuario.toLowerCase(),
          passwordHash: valores.passwordHash,
          nombres: valores.nombres,
          apellidos: valores.apellidos,
          tipoDocumento: valores.tipoDocumento,
          numeroDocumento: valores.numeroDocumento,
          esAdmin: valores.esAdmin,
          rolId: valores.rolId,
          alcance: valores.alcance,
          activo: true,
          debeCambiarPassword: true,
        })
        .returning(USUARIO_COLUMNS);
      const fila = filas[0];
      if (fila === undefined) throw new Error('No se pudo crear el usuario');
      return fila;
    });
  }

  async actualizar(
    ctx: TenantContext,
    id: string,
    cambios: {
      nombres?: string | undefined;
      apellidos?: string | undefined;
      usuario?: string | undefined;
      tipoDocumento?: TipoDocumento | undefined;
      numeroDocumento?: string | undefined;
      activo?: boolean | undefined;
      rolId?: string | null | undefined;
      alcance?: 'TODAS' | 'ESPECIFICAS' | undefined;
    },
  ): Promise<UsuarioRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .update(usuarios)
        .set({
          ...(cambios.nombres !== undefined ? { nombres: cambios.nombres } : {}),
          ...(cambios.apellidos !== undefined ? { apellidos: cambios.apellidos } : {}),
          ...(cambios.usuario !== undefined ? { usuario: cambios.usuario.toLowerCase() } : {}),
          ...(cambios.tipoDocumento !== undefined ? { tipoDocumento: cambios.tipoDocumento } : {}),
          ...(cambios.numeroDocumento !== undefined
            ? { numeroDocumento: cambios.numeroDocumento }
            : {}),
          ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
          ...(cambios.rolId !== undefined ? { rolId: cambios.rolId } : {}),
          ...(cambios.alcance !== undefined ? { alcance: cambios.alcance } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(usuarios.id, id), eq(usuarios.colegioId, ctx.colegioId)))
        .returning(USUARIO_COLUMNS);
      return filas[0] ?? null;
    });
  }

  /** Reemplaza el conjunto de permisos y devuelve los códigos aplicados. */
  async reemplazarPermisos(
    ctx: TenantContext,
    usuarioId: string,
    codigos: readonly string[],
    asignadoPorId: string,
  ): Promise<string[]> {
    return this.withTenant(ctx, async (tx) => {
      await tx
        .delete(usuariosPermisos)
        .where(
          and(
            eq(usuariosPermisos.colegioId, ctx.colegioId),
            eq(usuariosPermisos.usuarioId, usuarioId),
          ),
        );
      if (codigos.length === 0) return [];

      const filas = await tx
        .select({ id: permisos.id, codigo: permisos.codigo })
        .from(permisos)
        .where(inArray(permisos.codigo, [...codigos]));
      if (filas.length === 0) return [];

      await tx.insert(usuariosPermisos).values(
        filas.map((fila) => ({
          colegioId: ctx.colegioId,
          usuarioId,
          permisoId: fila.id,
          asignadoPorId,
        })),
      );
      return filas.map((fila) => fila.codigo);
    });
  }

  async catalogoPermisos(ctx: TenantContext): Promise<PermisoCatalogoItem[]> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select({ codigo: permisos.codigo, nombre: permisos.nombre, modulo: permisos.modulo })
        .from(permisos)
        .orderBy(asc(permisos.modulo), asc(permisos.nombre));
      return filas;
    });
  }

  /** Nueva contraseña temporal: hash + flag de cambio + reset de bloqueo. */
  async actualizarPasswordTemporal(
    ctx: TenantContext,
    id: string,
    passwordHash: string,
  ): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(usuarios)
        .set({
          passwordHash,
          debeCambiarPassword: true,
          intentosFallidos: 0,
          bloqueadoHasta: null,
          updatedAt: new Date(),
        })
        .where(and(eq(usuarios.id, id), eq(usuarios.colegioId, ctx.colegioId)));
    });
  }

  /** Revoca todas las sesiones activas del usuario (reset de contraseña). */
  async revocarSesiones(ctx: TenantContext, usuarioId: string): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(sesiones)
        .set({ revocadaEn: new Date() })
        .where(
          and(
            eq(sesiones.colegioId, ctx.colegioId),
            eq(sesiones.usuarioId, usuarioId),
            isNull(sesiones.revocadaEn),
          ),
        );
    });
  }

  /** Sedes asignadas por usuario (solo cuando el alcance es ESPECIFICAS). */
  async sedesPorUsuario(
    ctx: TenantContext,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; nombre: string }[]>> {
    const mapa = new Map<string, { id: string; nombre: string }[]>();
    if (ids.length === 0) return mapa;
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select({ usuarioId: usuariosSedes.usuarioId, id: sedes.id, nombre: sedes.nombre })
        .from(usuariosSedes)
        .innerJoin(sedes, eq(sedes.id, usuariosSedes.sedeId))
        .where(
          and(
            eq(usuariosSedes.colegioId, ctx.colegioId),
            inArray(usuariosSedes.usuarioId, [...ids]),
          ),
        );
      for (const fila of filas) {
        const actuales = mapa.get(fila.usuarioId) ?? [];
        actuales.push({ id: fila.id, nombre: fila.nombre });
        mapa.set(fila.usuarioId, actuales);
      }
      return mapa;
    });
  }

  /** Reemplaza las sedes de alcance de una persona. */
  async reemplazarSedes(
    ctx: TenantContext,
    usuarioId: string,
    sedesIds: readonly string[],
  ): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .delete(usuariosSedes)
        .where(
          and(eq(usuariosSedes.colegioId, ctx.colegioId), eq(usuariosSedes.usuarioId, usuarioId)),
        );
      if (sedesIds.length === 0) return;
      await tx
        .insert(usuariosSedes)
        .values(sedesIds.map((sedeId) => ({ colegioId: ctx.colegioId, usuarioId, sedeId })))
        .onConflictDoNothing();
    });
  }

  /** Sedes activas del colegio (para validar los ids recibidos). */
  async sedesDelColegio(ctx: TenantContext): Promise<{ id: string; nombre: string }[]> {
    return this.withTenant(ctx, async (tx) =>
      tx
        .select({ id: sedes.id, nombre: sedes.nombre })
        .from(sedes)
        .where(and(eq(sedes.colegioId, ctx.colegioId), isNull(sedes.deletedAt)))
        .orderBy(asc(sedes.nombre)),
    );
  }

  /** Rol del colegio por id (null si no existe o es de otro colegio). */
  async findRol(
    ctx: TenantContext,
    rolId: string,
  ): Promise<{
    id: string;
    nombre: string;
    tipoPersona: 'EMPLEADO' | 'ESTUDIANTE' | 'ACUDIENTE';
  } | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select({ id: roles.id, nombre: roles.nombre, tipoPersona: roles.tipoPersona })
        .from(roles)
        .where(and(eq(roles.id, rolId), eq(roles.colegioId, ctx.colegioId)))
        .limit(1);
      return filas[0] ?? null;
    });
  }
}
