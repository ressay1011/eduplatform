/**
 * RolesRepository — acceso a datos de roles del colegio.
 *
 * Todo corre con `withTenant` (RLS + filtro explícito por colegio_id). No
 * lanza HttpException: el service decide los status.
 *
 * `usuarios_permisos` se trata como PROYECCIÓN del rol: al cambiar los
 * permisos de un rol o la asignación de una persona, se resincroniza para que
 * los guards sigan leyendo una sola tabla por request.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { permisos, roles, rolesPermisos, sedes, usuarios } from '@eduplatform/database';
import type { RolListado, TipoPersonaRol } from '@eduplatform/types';
import { BaseRepository } from '../../shared/base.repository';

/** Fila de rol sin agregados. */
export interface RolRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipoPersona: TipoPersonaRol;
  esPredeterminado: boolean;
  activo: boolean;
}

const ROL_COLUMNS = {
  id: roles.id,
  nombre: roles.nombre,
  descripcion: roles.descripcion,
  tipoPersona: roles.tipoPersona,
  esPredeterminado: roles.esPredeterminado,
  activo: roles.activo,
} as const;

@Injectable()
export class RolesRepository extends BaseRepository {
  /** Roles del colegio con sus permisos y cuántas personas los tienen. */
  async listar(ctx: TenantContext): Promise<RolListado[]> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(ROL_COLUMNS)
        .from(roles)
        .where(eq(roles.colegioId, ctx.colegioId))
        .orderBy(asc(roles.esPredeterminado), asc(roles.nombre));

      const permisosPorRol = new Map<string, string[]>();
      const permisosFilas = await tx
        .select({ rolId: rolesPermisos.rolId, codigo: permisos.codigo })
        .from(rolesPermisos)
        .innerJoin(permisos, eq(permisos.id, rolesPermisos.permisoId))
        .where(eq(rolesPermisos.colegioId, ctx.colegioId));
      for (const fila of permisosFilas) {
        const actuales = permisosPorRol.get(fila.rolId) ?? [];
        actuales.push(fila.codigo);
        permisosPorRol.set(fila.rolId, actuales);
      }

      const conteos = await tx
        .select({ rolId: usuarios.rolId, total: count() })
        .from(usuarios)
        .where(and(eq(usuarios.colegioId, ctx.colegioId), isNull(usuarios.deletedAt)))
        .groupBy(usuarios.rolId);
      const personasPorRol = new Map<string, number>();
      for (const fila of conteos) {
        if (fila.rolId !== null) personasPorRol.set(fila.rolId, Number(fila.total));
      }

      return filas.map((fila) => ({
        ...fila,
        permisos: (permisosPorRol.get(fila.id) ?? []).sort(),
        personas: personasPorRol.get(fila.id) ?? 0,
      }));
    });
  }

  async findPorId(ctx: TenantContext, id: string): Promise<RolListado | null> {
    const todos = await this.listar(ctx);
    return todos.find((rol) => rol.id === id) ?? null;
  }

  /** ¿Otro rol del colegio ya usa ese nombre? (case-insensitive) */
  async existeNombre(ctx: TenantContext, nombre: string, exceptoId?: string): Promise<boolean> {
    return this.withTenant(ctx, async (tx) => {
      const condiciones = [
        eq(roles.colegioId, ctx.colegioId),
        sql`lower(${roles.nombre}) = lower(${nombre})`,
      ];
      if (exceptoId !== undefined) condiciones.push(ne(roles.id, exceptoId));
      const filas = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(...condiciones))
        .limit(1);
      return filas.length > 0;
    });
  }

  async crear(
    ctx: TenantContext,
    valores: { nombre: string; descripcion: string | null; tipoPersona: TipoPersonaRol },
  ): Promise<RolRow> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .insert(roles)
        .values({
          colegioId: ctx.colegioId,
          nombre: valores.nombre,
          descripcion: valores.descripcion,
          tipoPersona: valores.tipoPersona,
          esPredeterminado: false,
        })
        .returning(ROL_COLUMNS);
      const fila = filas[0];
      if (fila === undefined) throw new Error('No se pudo crear el rol');
      return fila;
    });
  }

  async actualizar(
    ctx: TenantContext,
    id: string,
    cambios: {
      nombre?: string | undefined;
      descripcion?: string | null | undefined;
      tipoPersona?: TipoPersonaRol | undefined;
      activo?: boolean | undefined;
    },
  ): Promise<RolRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .update(roles)
        .set({
          ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
          ...(cambios.descripcion !== undefined ? { descripcion: cambios.descripcion } : {}),
          ...(cambios.tipoPersona !== undefined ? { tipoPersona: cambios.tipoPersona } : {}),
          ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(roles.id, id), eq(roles.colegioId, ctx.colegioId)))
        .returning(ROL_COLUMNS);
      return filas[0] ?? null;
    });
  }

  async eliminar(ctx: TenantContext, id: string): Promise<boolean> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .delete(roles)
        .where(and(eq(roles.id, id), eq(roles.colegioId, ctx.colegioId)))
        .returning({ id: roles.id });
      return filas.length > 0;
    });
  }

  /** Reemplaza los permisos del rol y devuelve los códigos aplicados. */
  async reemplazarPermisos(
    ctx: TenantContext,
    rolId: string,
    codigos: readonly string[],
  ): Promise<string[]> {
    return this.withTenant(ctx, async (tx) => {
      await tx
        .delete(rolesPermisos)
        .where(and(eq(rolesPermisos.colegioId, ctx.colegioId), eq(rolesPermisos.rolId, rolId)));
      if (codigos.length === 0) return [];

      const filas = await tx
        .select({ id: permisos.id, codigo: permisos.codigo })
        .from(permisos)
        .where(inArray(permisos.codigo, [...codigos]));
      if (filas.length === 0) return [];

      await tx
        .insert(rolesPermisos)
        .values(filas.map((fila) => ({ colegioId: ctx.colegioId, rolId, permisoId: fila.id })));
      return filas.map((fila) => fila.codigo);
    });
  }

  /**
   * Copia los permisos del rol a `usuarios_permisos` para todas las personas
   * que lo tienen. SQL crudo justificado: es una proyección masiva que Drizzle
   * no expresa sin N+1.
   */
  async sincronizarProyeccion(
    ctx: TenantContext,
    rolId: string,
    asignadoPorId: string,
  ): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx.execute(sql`
        DELETE FROM usuarios_permisos up
        USING usuarios u
        WHERE up.usuario_id = u.id
          AND u.colegio_id = ${ctx.colegioId}
          AND u.rol_id = ${rolId}
      `);
      await tx.execute(sql`
        INSERT INTO usuarios_permisos (colegio_id, usuario_id, permiso_id, asignado_por_id)
        SELECT u.colegio_id, u.id, rp.permiso_id, ${asignadoPorId}
        FROM usuarios u
        JOIN roles_permisos rp ON rp.rol_id = u.rol_id AND rp.colegio_id = u.colegio_id
        WHERE u.colegio_id = ${ctx.colegioId}
          AND u.rol_id = ${rolId}
        ON CONFLICT (usuario_id, permiso_id) DO NOTHING
      `);
    });
  }

  /** Sedes del colegio para el selector de alcance. */
  async sedes(ctx: TenantContext): Promise<{ id: string; nombre: string }[]> {
    return this.withTenant(ctx, async (tx) =>
      tx
        .select({ id: sedes.id, nombre: sedes.nombre })
        .from(sedes)
        .where(and(eq(sedes.colegioId, ctx.colegioId), isNull(sedes.deletedAt)))
        .orderBy(asc(sedes.nombre)),
    );
  }
}
