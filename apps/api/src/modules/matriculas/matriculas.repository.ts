/**
 * MatriculasRepository — persistencia del módulo Matrículas.
 *
 * Todo va con `withTenant` (RLS + filtro por colegio_id). Las reglas de negocio
 * viven en el service; aquí solo se lee/escribe. La matrícula referencia la
 * ficha `estudiantes` (no `usuarios`): el modelo separa cuenta y datos SIMAT.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext, Tx } from '@eduplatform/database';
import {
  aniosLectivos,
  estudiantes,
  grados,
  grupos,
  matriculas,
  roles,
  sedes,
  usuarios,
} from '@eduplatform/database';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type {
  CursoMatricula,
  Jornada,
  ListaMatriculas,
  ListarMatriculasQuery,
} from '@eduplatform/types';
import { EstadoEstudiante, CondicionMatricula } from '@eduplatform/types';
import { BaseRepository } from '../../shared/base.repository';

/** Curso con sus IDs internos (para validar y crear la matrícula). */
export interface CursoInterno {
  id: string;
  anioLectivoId: string;
  anio: number;
  sedeId: string;
  sedeNombre: string;
  gradoNumero: number;
  letra: string;
  jornada: Jornada;
}

/** Cuenta encontrada por documento, con su ficha de estudiante si existe. */
export interface CuentaEstudiante {
  usuarioId: string;
  nombres: string | null;
  apellidos: string | null;
  usuario: string;
  /** null si la cuenta existe pero aún no tiene ficha en `estudiantes`. */
  estudianteId: string | null;
  rolTipoPersona: string | null;
}

/** Datos para crear la ficha `estudiantes` de una cuenta que ya existe. */
export interface DatosPerfilEstudiante {
  usuarioId: string;
  codigoMatricula: string;
  fechaNacimiento: string;
}

/** Datos ya resueltos para insertar la matrícula. */
export interface DatosNuevaMatricula {
  estudianteId: string;
  cursoId: string;
  anioLectivoId: string;
  condicion: CondicionMatricula;
  fechaMatricula: string;
}

type Filtros = ListarMatriculasQuery & { page: number; limit: number };

@Injectable()
export class MatriculasRepository extends BaseRepository {
  /** Cursos del año lectivo más reciente (el wizard matricula en el año vigente). */
  async cursos(ctx: TenantContext): Promise<CursoMatricula[]> {
    return this.withTenant(ctx, async (tx) => {
      const anio = await this.anioVigenteTx(tx, ctx);
      if (anio === null) return [];

      const filas = await tx
        .select({
          id: grupos.id,
          letra: grupos.letra,
          jornada: grupos.jornada,
          sedeId: sedes.id,
          sedeNombre: sedes.nombre,
          gradoNumero: grados.numero,
          gradoNombre: grados.nombre,
          anioLectivoId: aniosLectivos.id,
          anio: aniosLectivos.anio,
        })
        .from(grupos)
        .innerJoin(sedes, eq(sedes.id, grupos.sedeId))
        .innerJoin(grados, eq(grados.id, grupos.gradoId))
        .innerJoin(aniosLectivos, eq(aniosLectivos.id, grupos.anioLectivoId))
        .where(and(eq(grupos.colegioId, ctx.colegioId), eq(grupos.anioLectivoId, anio.id)))
        .orderBy(asc(grados.numero), asc(grupos.letra), asc(grupos.jornada));

      return filas.map((fila) => ({
        id: fila.id,
        nombre: `${fila.gradoNombre} ${fila.letra}`.trim(),
        grado: fila.gradoNumero,
        letra: fila.letra,
        jornada: fila.jornada,
        sedeId: fila.sedeId,
        sedeNombre: fila.sedeNombre,
        anioLectivoId: fila.anioLectivoId,
        anio: fila.anio,
      }));
    });
  }

  /** Año lectivo más reciente del colegio. */
  private async anioVigenteTx(
    tx: Tx,
    ctx: TenantContext,
  ): Promise<{ id: string; anio: number } | null> {
    const [fila] = await tx
      .select({ id: aniosLectivos.id, anio: aniosLectivos.anio })
      .from(aniosLectivos)
      .where(eq(aniosLectivos.colegioId, ctx.colegioId))
      .orderBy(desc(aniosLectivos.anio))
      .limit(1);
    return fila ?? null;
  }

  /** Curso por id, solo si pertenece al colegio. */
  async cursoPorId(ctx: TenantContext, cursoId: string): Promise<CursoInterno | null> {
    return this.withTenant(ctx, async (tx) => {
      const [fila] = await tx
        .select({
          id: grupos.id,
          anioLectivoId: grupos.anioLectivoId,
          anio: aniosLectivos.anio,
          sedeId: sedes.id,
          sedeNombre: sedes.nombre,
          gradoNumero: grados.numero,
          letra: grupos.letra,
          jornada: grupos.jornada,
        })
        .from(grupos)
        .innerJoin(sedes, eq(sedes.id, grupos.sedeId))
        .innerJoin(grados, eq(grados.id, grupos.gradoId))
        .innerJoin(aniosLectivos, eq(aniosLectivos.id, grupos.anioLectivoId))
        .where(and(eq(grupos.id, cursoId), eq(grupos.colegioId, ctx.colegioId)))
        .limit(1);
      return fila ?? null;
    });
  }

  /** Ficha del estudiante por id (solo del colegio). */
  async estudiantePorId(
    ctx: TenantContext,
    estudianteId: string,
  ): Promise<{ id: string; usuarioId: string } | null> {
    return this.withTenant(ctx, async (tx) => {
      const [fila] = await tx
        .select({ id: estudiantes.id, usuarioId: estudiantes.usuarioId })
        .from(estudiantes)
        .where(
          and(
            eq(estudiantes.id, estudianteId),
            eq(estudiantes.colegioId, ctx.colegioId),
            isNull(estudiantes.deletedAt),
          ),
        )
        .limit(1);
      return fila ?? null;
    });
  }

  /** Cuenta por documento (con su ficha y el tipo de su rol, si tiene). */
  async buscarCuentaPorDocumento(
    ctx: TenantContext,
    documento: string,
  ): Promise<CuentaEstudiante | null> {
    return this.withTenant(ctx, async (tx) => {
      const [fila] = await tx
        .select({
          usuarioId: usuarios.id,
          nombres: usuarios.nombres,
          apellidos: usuarios.apellidos,
          usuario: usuarios.usuario,
          estudianteId: estudiantes.id,
          rolTipoPersona: roles.tipoPersona,
        })
        .from(usuarios)
        .leftJoin(
          estudiantes,
          and(
            eq(estudiantes.usuarioId, usuarios.id),
            eq(estudiantes.colegioId, ctx.colegioId),
            isNull(estudiantes.deletedAt),
          ),
        )
        .leftJoin(roles, eq(roles.id, usuarios.rolId))
        .where(
          and(
            eq(usuarios.colegioId, ctx.colegioId),
            eq(usuarios.numeroDocumento, documento),
            isNull(usuarios.deletedAt),
          ),
        )
        .limit(1);
      return fila ?? null;
    });
  }

  /** Crea la ficha `estudiantes` de una cuenta existente y devuelve su id. */
  async crearPerfilEstudiante(
    ctx: TenantContext,
    datos: DatosPerfilEstudiante,
  ): Promise<string | null> {
    return this.withTenant(ctx, async (tx) => {
      const [creado] = await tx
        .insert(estudiantes)
        .values({
          colegioId: ctx.colegioId,
          usuarioId: datos.usuarioId,
          codigoMatricula: datos.codigoMatricula,
          fechaNacimiento: datos.fechaNacimiento,
          estado: EstadoEstudiante.MATRICULADO,
        })
        .onConflictDoNothing()
        .returning({ id: estudiantes.id });

      if (creado !== undefined) return creado.id;

      // Carrera con otra petición: la ficha ya existe, se reutiliza.
      const [existente] = await tx
        .select({ id: estudiantes.id })
        .from(estudiantes)
        .where(
          and(
            eq(estudiantes.usuarioId, datos.usuarioId),
            eq(estudiantes.colegioId, ctx.colegioId),
            isNull(estudiantes.deletedAt),
          ),
        )
        .limit(1);
      return existente?.id ?? null;
    });
  }

  /** Matrícula del estudiante en ese año (activa, retirada o anulada). */
  async matriculaDe(
    ctx: TenantContext,
    estudianteId: string,
    anioLectivoId: string,
  ): Promise<{ id: string; estado: string } | null> {
    return this.withTenant(ctx, async (tx) => {
      const [fila] = await tx
        .select({ id: matriculas.id, estado: matriculas.estado })
        .from(matriculas)
        .where(
          and(
            eq(matriculas.colegioId, ctx.colegioId),
            eq(matriculas.estudianteId, estudianteId),
            eq(matriculas.anioLectivoId, anioLectivoId),
          ),
        )
        .limit(1);
      return fila ?? null;
    });
  }

  /** Inserta la matrícula (el UNIQUE del año la protege a nivel de BD). */
  async crear(ctx: TenantContext, datos: DatosNuevaMatricula): Promise<string> {
    return this.withTenant(ctx, async (tx) => {
      const [creada] = await tx
        .insert(matriculas)
        .values({
          colegioId: ctx.colegioId,
          anioLectivoId: datos.anioLectivoId,
          estudianteId: datos.estudianteId,
          grupoId: datos.cursoId,
          fechaMatricula: datos.fechaMatricula,
          condicion: datos.condicion,
          estado: 'MATRICULADO',
        })
        .returning({ id: matriculas.id });
      if (creada === undefined) throw new Error('No se pudo crear la matrícula');
      return creada.id;
    });
  }

  /** Listado con estudiante y curso; filtrable por curso y año. */
  async listar(ctx: TenantContext, filtros: Filtros): Promise<ListaMatriculas> {
    return this.withTenant(ctx, async (tx) => {
      const condiciones = [eq(matriculas.colegioId, ctx.colegioId)];
      if (filtros.cursoId !== undefined) {
        condiciones.push(eq(matriculas.grupoId, filtros.cursoId));
      }
      if (filtros.anioLectivoId !== undefined) {
        condiciones.push(eq(matriculas.anioLectivoId, filtros.anioLectivoId));
      }
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
          id: matriculas.id,
          estudianteId: matriculas.estudianteId,
          nombres: usuarios.nombres,
          apellidos: usuarios.apellidos,
          numeroDocumento: usuarios.numeroDocumento,
          cursoId: grupos.id,
          gradoNombre: grados.nombre,
          letra: grupos.letra,
          sede: sedes.nombre,
          jornada: grupos.jornada,
          anio: aniosLectivos.anio,
          estado: matriculas.estado,
          condicion: matriculas.condicion,
          fechaMatricula: matriculas.fechaMatricula,
          total: sql<number>`count(*) over ()`,
        })
        .from(matriculas)
        .innerJoin(estudiantes, eq(estudiantes.id, matriculas.estudianteId))
        .innerJoin(usuarios, eq(usuarios.id, estudiantes.usuarioId))
        .innerJoin(grupos, eq(grupos.id, matriculas.grupoId))
        .innerJoin(grados, eq(grados.id, grupos.gradoId))
        .innerJoin(sedes, eq(sedes.id, grupos.sedeId))
        .innerJoin(aniosLectivos, eq(aniosLectivos.id, matriculas.anioLectivoId))
        .where(and(...condiciones))
        .orderBy(desc(aniosLectivos.anio), asc(usuarios.apellidos), asc(usuarios.nombres))
        .limit(filtros.limit)
        .offset((filtros.page - 1) * filtros.limit);

      return {
        items: filas.map((fila) => ({
          id: fila.id,
          estudianteId: fila.estudianteId,
          nombres: fila.nombres,
          apellidos: fila.apellidos,
          numeroDocumento: fila.numeroDocumento,
          cursoId: fila.cursoId,
          curso: `${fila.gradoNombre} ${fila.letra}`.trim(),
          sede: fila.sede,
          jornada: fila.jornada,
          anio: fila.anio,
          estado: fila.estado,
          condicion: fila.condicion,
          fechaMatricula: fila.fechaMatricula,
        })),
        total: Number(filas[0]?.total ?? 0),
        page: filtros.page,
        limit: filtros.limit,
      };
    });
  }

  /** Baja lógica: estado RETIRADO. */
  async retirar(ctx: TenantContext, matriculaId: string): Promise<boolean> {
    return this.withTenant(ctx, async (tx) => {
      const [fila] = await tx
        .update(matriculas)
        .set({ estado: 'RETIRADO', updatedAt: new Date() })
        .where(and(eq(matriculas.id, matriculaId), eq(matriculas.colegioId, ctx.colegioId)))
        .returning({ id: matriculas.id });
      return fila !== undefined;
    });
  }
}
