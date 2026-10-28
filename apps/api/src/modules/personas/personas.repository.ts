/**
 * PersonasRepository — listados de las pestañas del módulo Personas.
 *
 * Empleados salen de `usuarios` + su rol; estudiantes de `estudiantes` +
 * `usuarios`; acudientes de `usuarios` con vínculos en `acudientes_estudiantes`.
 * Solo lectura: el alta/edición de estudiantes y acudientes llega con el
 * módulo de matrículas.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import { and, asc, count, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { acudientesEstudiantes, estudiantes, roles, usuarios } from '@eduplatform/database';
import type {
  ListaPersonas,
  ListarPersonasQuery,
  PersonaAcudiente,
  PersonaEmpleado,
  PersonaEstudiante,
} from '@eduplatform/types';
import { BaseRepository } from '../../shared/base.repository';

type Filtros = ListarPersonasQuery & { page: number; limit: number };

/** La cuenta del estudiante (el acudiente es otra fila de `usuarios`). */
const usuarioEstudiante = alias(usuarios, 'usuario_estudiante');

@Injectable()
export class PersonasRepository extends BaseRepository {
  /** Empleados: administradores y personas con rol de tipo EMPLEADO. */
  async empleados(ctx: TenantContext, filtros: Filtros): Promise<ListaPersonas<PersonaEmpleado>> {
    return this.withTenant(ctx, async (tx) => {
      const condiciones = [
        eq(usuarios.colegioId, ctx.colegioId),
        isNull(usuarios.deletedAt),
        or(
          eq(roles.tipoPersona, 'EMPLEADO'),
          and(isNull(usuarios.rolId), eq(usuarios.esAdmin, true)),
        ),
      ];
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
      const where = and(...condiciones);

      const filas = await tx
        .select({
          id: usuarios.id,
          nombres: usuarios.nombres,
          apellidos: usuarios.apellidos,
          usuario: usuarios.usuario,
          tipoDocumento: usuarios.tipoDocumento,
          numeroDocumento: usuarios.numeroDocumento,
          esAdmin: usuarios.esAdmin,
          activo: usuarios.activo,
          rolId: usuarios.rolId,
          rolNombre: roles.nombre,
          alcance: usuarios.alcance,
          ultimoAcceso: usuarios.ultimoAcceso,
          total: sql<number>`count(*) over ()`,
        })
        .from(usuarios)
        .leftJoin(roles, eq(roles.id, usuarios.rolId))
        .where(where)
        .orderBy(asc(usuarios.apellidos), asc(usuarios.nombres))
        .limit(filtros.limit)
        .offset((filtros.page - 1) * filtros.limit);

      return {
        items: filas.map((fila) => ({
          id: fila.id,
          nombres: fila.nombres,
          apellidos: fila.apellidos,
          usuario: fila.usuario,
          tipoDocumento: fila.tipoDocumento,
          numeroDocumento: fila.numeroDocumento,
          esAdmin: fila.esAdmin,
          activo: fila.activo,
          rolId: fila.rolId,
          rolNombre: fila.rolNombre,
          alcance: fila.alcance,
          sedes: [],
          ultimoAcceso: fila.ultimoAcceso === null ? null : fila.ultimoAcceso.toISOString(),
        })),
        total: Number(filas[0]?.total ?? 0),
        page: filtros.page,
        limit: filtros.limit,
      };
    });
  }

  /** Estudiantes con su cuenta y el curso de su matrícula vigente. */
  async estudiantes(
    ctx: TenantContext,
    filtros: Filtros,
  ): Promise<ListaPersonas<PersonaEstudiante>> {
    return this.withTenant(ctx, async (tx) => {
      const condiciones = [eq(estudiantes.colegioId, ctx.colegioId), isNull(estudiantes.deletedAt)];
      if (filtros.q !== undefined && filtros.q !== '') {
        const patron = `%${filtros.q}%`;
        const busqueda = or(
          ilike(usuarios.nombres, patron),
          ilike(usuarios.apellidos, patron),
          ilike(usuarios.numeroDocumento, patron),
          ilike(estudiantes.codigoMatricula, patron),
        );
        if (busqueda !== undefined) condiciones.push(busqueda);
      }

      const filas = await tx
        .select({
          id: estudiantes.id,
          usuarioId: estudiantes.usuarioId,
          nombres: usuarios.nombres,
          apellidos: usuarios.apellidos,
          numeroDocumento: usuarios.numeroDocumento,
          usuario: usuarios.usuario,
          codigoMatricula: estudiantes.codigoMatricula,
          estado: estudiantes.estado,
          activo: usuarios.activo,
          // Curso de la matrícula vigente (módulo Matrículas); null si no tiene.
          curso: sql<string | null>`(
            select gr.nombre || ' ' || g.letra
            from matriculas m
            join grupos g on g.id = m.grupo_id
            join grados gr on gr.id = g.grado_id
            where m.estudiante_id = ${estudiantes.id}
              and m.colegio_id = ${ctx.colegioId}
              and m.estado = 'MATRICULADO'
            order by m.fecha_matricula desc
            limit 1
          )`,
          // Acudiente principal del estudiante: el primero marcado como tal.
          acudiente: sql<string | null>`(
            select ua.nombres || ' ' || ua.apellidos
            from acudientes_estudiantes ae
            join usuarios ua on ua.id = ae.acudiente_id
            where ae.estudiante_id = ${estudiantes.id}
              and ae.colegio_id = ${ctx.colegioId}
            order by ae.es_principal desc, ua.nombres
            limit 1
          )`,
          total: sql<number>`count(*) over ()`,
        })
        .from(estudiantes)
        .innerJoin(usuarios, eq(usuarios.id, estudiantes.usuarioId))
        .where(and(...condiciones))
        .orderBy(asc(usuarios.apellidos), asc(usuarios.nombres))
        .limit(filtros.limit)
        .offset((filtros.page - 1) * filtros.limit);

      return {
        items: filas,
        total: Number(filas[0]?.total ?? 0),
        page: filtros.page,
        limit: filtros.limit,
      };
    });
  }

  /** Acudientes con la lista de estudiantes a cargo. */
  async acudientes(ctx: TenantContext, filtros: Filtros): Promise<ListaPersonas<PersonaAcudiente>> {
    return this.withTenant(ctx, async (tx) => {
      const condiciones = [eq(usuarios.colegioId, ctx.colegioId), isNull(usuarios.deletedAt)];
      if (filtros.q !== undefined && filtros.q !== '') {
        const patron = `%${filtros.q}%`;
        const busqueda = or(
          ilike(usuarios.nombres, patron),
          ilike(usuarios.apellidos, patron),
          ilike(usuarios.numeroDocumento, patron),
        );
        if (busqueda !== undefined) condiciones.push(busqueda);
      }

      const filas = await tx
        .select({
          id: usuarios.id,
          nombres: usuarios.nombres,
          apellidos: usuarios.apellidos,
          numeroDocumento: usuarios.numeroDocumento,
          usuario: usuarios.usuario,
          activo: usuarios.activo,
          estudiantes: sql<
            string[]
          >`array_agg(${usuarioEstudiante.nombres} || ' ' || ${usuarioEstudiante.apellidos})`,
          telefono: sql<string | null>`max(${acudientesEstudiantes.telefono})`,
          total: sql<number>`count(*) over ()`,
        })
        .from(acudientesEstudiantes)
        .innerJoin(usuarios, eq(usuarios.id, acudientesEstudiantes.acudienteId))
        .innerJoin(estudiantes, eq(estudiantes.id, acudientesEstudiantes.estudianteId))
        .innerJoin(usuarioEstudiante, eq(usuarioEstudiante.id, estudiantes.usuarioId))
        .where(and(eq(acudientesEstudiantes.colegioId, ctx.colegioId), ...condiciones))
        .groupBy(
          usuarios.id,
          usuarios.nombres,
          usuarios.apellidos,
          usuarios.numeroDocumento,
          usuarios.usuario,
          usuarios.activo,
        )
        .orderBy(asc(usuarios.apellidos), asc(usuarios.nombres))
        .limit(filtros.limit)
        .offset((filtros.page - 1) * filtros.limit);

      return {
        items: filas.map((fila) => ({
          id: fila.id,
          nombres: fila.nombres,
          apellidos: fila.apellidos,
          numeroDocumento: fila.numeroDocumento,
          usuario: fila.usuario,
          telefono: fila.telefono,
          activo: fila.activo,
          estudiantes: fila.estudiantes.filter((nombre): nombre is string => nombre !== null),
        })),
        total: Number(filas[0]?.total ?? 0),
        page: filtros.page,
        limit: filtros.limit,
      };
    });
  }

  /** Conteos de las pestañas para las tarjetas del encabezado. */
  async resumen(
    ctx: TenantContext,
  ): Promise<{ empleados: number; estudiantes: number; acudientes: number }> {
    return this.withTenant(ctx, async (tx) => {
      const [emp] = await tx
        .select({ total: count() })
        .from(usuarios)
        .leftJoin(roles, eq(roles.id, usuarios.rolId))
        .where(
          and(
            eq(usuarios.colegioId, ctx.colegioId),
            isNull(usuarios.deletedAt),
            or(
              eq(roles.tipoPersona, 'EMPLEADO'),
              and(isNull(usuarios.rolId), eq(usuarios.esAdmin, true)),
            ),
          ),
        );
      const [est] = await tx
        .select({ total: count() })
        .from(estudiantes)
        .where(and(eq(estudiantes.colegioId, ctx.colegioId), isNull(estudiantes.deletedAt)));
      const [acu] = await tx
        .select({ total: sql<number>`count(distinct ${acudientesEstudiantes.acudienteId})` })
        .from(acudientesEstudiantes)
        .where(eq(acudientesEstudiantes.colegioId, ctx.colegioId));
      return {
        empleados: Number(emp?.total ?? 0),
        estudiantes: Number(est?.total ?? 0),
        acudientes: Number(acu?.total ?? 0),
      };
    });
  }
}
