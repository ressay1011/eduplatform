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
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type {
  CursoMatricula,
  Jornada,
  ListaMatriculas,
  ListarMatriculasQuery,
  TipoDocumento,
} from '@eduplatform/types';
import { EstadoEstudiante, CondicionMatricula } from '@eduplatform/types';
import { BaseRepository } from '../../shared/base.repository';

/** Curso con sus IDs internos (para validar y crear la matrícula). */
export interface CursoInterno {
  id: string;
  anioLectivoId: string;
  anio: number;
  /** Estado del año lectivo: un año CERRADO no admite matrículas nuevas. */
  estadoAnio: 'CONFIGURACION' | 'ACTIVO' | 'CERRADO';
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

/** Una fila del CSV ya resuelta contra el curso del año vigente. */
export interface DatosFilaImportada {
  documento: string;
  cursoId: string;
  anioLectivoId: string;
  condicion: CondicionMatricula;
  fechaMatricula: string;
  /** Solo se exige cuando la cuenta todavía no tiene ficha. */
  fechaNacimiento?: string;
  /** Desambigua dos cuentas con el mismo número y distinto tipo. */
  tipoDocumento?: TipoDocumento;
}

/**
 * Lo que pasó con la fila: hechos, no status ni mensajes —el texto que ve el
 * usuario lo decide el service—.
 */
export type ResultadoFilaImportada =
  | { estado: 'creada'; matriculaId: string }
  | { estado: 'sin-cuenta' }
  | { estado: 'documento-ambiguo' }
  | { estado: 'cuenta-sin-rol-estudiante' }
  | { estado: 'falta-fecha-nacimiento' }
  | { estado: 'ficha-no-creada' }
  | { estado: 'ya-matriculado' };

/** Resultado de la baja, con lo necesario para la auditoría. */
export interface ResultadoRetiro {
  /** false si la matrícula no existe en este colegio. */
  retirada: boolean;
  /** true si ya estaba RETIRADA: la baja es idempotente. */
  yaRetirada: boolean;
  /** Año lectivo de la matrícula (va en el motivo del log). */
  anio: number | null;
  /** La baja es de un año anterior o cerrado: se registra como corrección. */
  correccion: boolean;
  /** Estado en el que estaba la matrícula antes de la baja. */
  estadoPrevio: string | null;
  /** true si el estudiante se quedó sin matrículas vigentes y pasó a RETIRADO. */
  estudianteRetirado: boolean;
}

const SIN_RETIRO: ResultadoRetiro = {
  retirada: false,
  yaRetirada: false,
  anio: null,
  correccion: false,
  estadoPrevio: null,
  estudianteRetirado: false,
};

type Filtros = ListarMatriculasQuery & { page: number; limit: number };

@Injectable()
export class MatriculasRepository extends BaseRepository {
  /** Cursos del año lectivo vigente (el ACTIVO; ver `anioVigenteTx`). */
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

  /**
   * Año lectivo en el que se matricula: el `ACTIVO` y, si el colegio no tiene
   * ninguno, el más reciente que no esté `CERRADO` (un año en `CONFIGURACION`
   * sirve para matricular antes de que empiece). Los cerrados nunca entran: con
   * `order by anio desc` a secas, un año futuro ya creado se llevaba todas las
   * matrículas en silencio.
   */
  private async anioVigenteTx(
    tx: Tx,
    ctx: TenantContext,
  ): Promise<{ id: string; anio: number } | null> {
    const [fila] = await tx
      .select({ id: aniosLectivos.id, anio: aniosLectivos.anio })
      .from(aniosLectivos)
      .where(and(eq(aniosLectivos.colegioId, ctx.colegioId), ne(aniosLectivos.estado, 'CERRADO')))
      .orderBy(
        sql`case when ${aniosLectivos.estado} = 'ACTIVO' then 0 else 1 end`,
        desc(aniosLectivos.anio),
      )
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
          estadoAnio: aniosLectivos.estado,
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

  /**
   * Importación de UNA fila del CSV, en una sola transacción.
   *
   * Devuelve el HECHO —no el status ni el mensaje, que son del service— para que
   * la ficha, la matrícula y el estado del estudiante se confirmen juntos o no
   * se confirmen: antes la ficha se creaba en su propia transacción y, si la
   * matrícula fallaba, quedaba un estudiante `MATRICULADO` sin ella.
   */
  async matricularDesdeCsv(
    ctx: TenantContext,
    datos: DatosFilaImportada,
  ): Promise<ResultadoFilaImportada> {
    return this.withTenant(ctx, async (tx) => {
      const cuentas = await this.buscarCuentasPorDocumentoTx(
        tx,
        ctx,
        datos.documento,
        datos.tipoDocumento,
      );
      if (cuentas.length === 0) return { estado: 'sin-cuenta' };
      // Dos cuentas con el mismo número y distinto tipo: sin `tipoDocumento` no
      // se elige al azar, se pide el dato (antes se mataba a quien saliera).
      if (cuentas.length > 1) return { estado: 'documento-ambiguo' };
      const [cuenta] = cuentas;
      if (cuenta === undefined) return { estado: 'sin-cuenta' };

      let estudianteId = cuenta.estudianteId;
      if (estudianteId === null) {
        if (cuenta.rolTipoPersona !== 'ESTUDIANTE') {
          return { estado: 'cuenta-sin-rol-estudiante' };
        }
        if (datos.fechaNacimiento === undefined) return { estado: 'falta-fecha-nacimiento' };
        estudianteId = await this.crearPerfilEstudianteTx(tx, ctx, {
          usuarioId: cuenta.usuarioId,
          codigoMatricula: datos.documento,
          fechaNacimiento: datos.fechaNacimiento,
        });
        if (estudianteId === null) return { estado: 'ficha-no-creada' };
      }

      const existente = await this.matriculaDeTx(tx, ctx, estudianteId, datos.anioLectivoId);
      if (existente !== null) return { estado: 'ya-matriculado' };

      const matriculaId = await this.crearTx(tx, ctx, {
        estudianteId,
        cursoId: datos.cursoId,
        anioLectivoId: datos.anioLectivoId,
        condicion: datos.condicion,
        fechaMatricula: datos.fechaMatricula,
      });
      return { estado: 'creada', matriculaId };
    });
  }

  /**
   * Cuentas que coinciden con el documento (con su ficha y el tipo de su rol).
   *
   * Hasta dos: el llamador solo necesita saber si hay una o varias. El filtro
   * por `tipoDocumento` existe porque el UNIQUE de la tabla es
   * `(colegio_id, tipo_documento, numero_documento)`.
   */
  private async buscarCuentasPorDocumentoTx(
    tx: Tx,
    ctx: TenantContext,
    documento: string,
    tipoDocumento?: TipoDocumento,
  ): Promise<CuentaEstudiante[]> {
    const condiciones = [
      eq(usuarios.colegioId, ctx.colegioId),
      eq(usuarios.numeroDocumento, documento),
      isNull(usuarios.deletedAt),
    ];
    if (tipoDocumento !== undefined) {
      condiciones.push(eq(usuarios.tipoDocumento, tipoDocumento));
    }

    return tx
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
      .where(and(...condiciones))
      .limit(2);
  }

  /**
   * Crea la ficha `estudiantes` de una cuenta existente y devuelve su id.
   *
   * Nace en `INSCRITO`: quien la sube a `MATRICULADO` es `crearTx`, al insertar
   * la matrícula. Una ficha sin matrícula nunca se declara matriculada.
   */
  private async crearPerfilEstudianteTx(
    tx: Tx,
    ctx: TenantContext,
    datos: DatosPerfilEstudiante,
  ): Promise<string | null> {
    const [creado] = await tx
      .insert(estudiantes)
      .values({
        colegioId: ctx.colegioId,
        usuarioId: datos.usuarioId,
        codigoMatricula: datos.codigoMatricula,
        fechaNacimiento: datos.fechaNacimiento,
        estado: EstadoEstudiante.INSCRITO,
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
  }

  /** Matrícula del estudiante en ese año (activa, retirada o anulada). */
  async matriculaDe(
    ctx: TenantContext,
    estudianteId: string,
    anioLectivoId: string,
  ): Promise<{ id: string; estado: string } | null> {
    return this.withTenant(ctx, (tx) => this.matriculaDeTx(tx, ctx, estudianteId, anioLectivoId));
  }

  private async matriculaDeTx(
    tx: Tx,
    ctx: TenantContext,
    estudianteId: string,
    anioLectivoId: string,
  ): Promise<{ id: string; estado: string } | null> {
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
  }

  /** Inserta la matrícula (el UNIQUE del año la protege a nivel de BD). */
  async crear(ctx: TenantContext, datos: DatosNuevaMatricula): Promise<string> {
    return this.withTenant(ctx, (tx) => this.crearTx(tx, ctx, datos));
  }

  /** Misma inserción que `crear`, dentro de una transacción ya abierta. */
  private async crearTx(tx: Tx, ctx: TenantContext, datos: DatosNuevaMatricula): Promise<string> {
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

    // Invariante: con matrícula vigente, la ficha está MATRICULADO. Cubre al
    // estudiante que fue retirado y vuelve al colegio.
    await tx
      .update(estudiantes)
      .set({ estado: EstadoEstudiante.MATRICULADO, updatedAt: new Date() })
      .where(and(eq(estudiantes.id, datos.estudianteId), eq(estudiantes.colegioId, ctx.colegioId)));

    return creada.id;
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

      // El total va en su propia consulta: `count(*) over ()` se calcula antes
      // del LIMIT, pero se leía de la primera fila, así que una página fuera de
      // rango devolvía total 0 aunque hubiera matrículas. Solo se unen las
      // tablas que usan los filtros de arriba (`usuarios` para `q`); un filtro
      // nuevo sobre otra tabla tiene que traer su join aquí también.
      const [conteo] = await tx
        .select({ total: sql<number>`count(*)` })
        .from(matriculas)
        .innerJoin(estudiantes, eq(estudiantes.id, matriculas.estudianteId))
        .innerJoin(usuarios, eq(usuarios.id, estudiantes.usuarioId))
        .where(and(...condiciones));

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
          nombres: fila.nombres ?? '',
          apellidos: fila.apellidos ?? '',
          numeroDocumento: fila.numeroDocumento ?? '',
          cursoId: fila.cursoId,
          curso: `${fila.gradoNombre} ${fila.letra}`.trim(),
          sede: fila.sede,
          jornada: fila.jornada,
          anio: fila.anio,
          estado: fila.estado,
          condicion: fila.condicion,
          fechaMatricula: fila.fechaMatricula,
        })),
        total: Number(conteo?.total ?? 0),
        page: filtros.page,
        limit: filtros.limit,
      };
    });
  }

  /**
   * Reactiva una matrícula RETIRADA o ANULADA del mismo año.
   *
   * El UNIQUE `(anio_lectivo_id, estudiante_id)` impide crear otra fila, así que
   * el reingreso es el MISMO registro: se le cambian curso, condición y fecha y
   * vuelve a MATRICULADO. La ficha del estudiante también vuelve a MATRICULADO.
   */
  async reactivar(
    ctx: TenantContext,
    datos: DatosNuevaMatricula & { matriculaId: string },
  ): Promise<string> {
    return this.withTenant(ctx, async (tx) => {
      const [fila] = await tx
        .update(matriculas)
        .set({
          grupoId: datos.cursoId,
          condicion: datos.condicion,
          fechaMatricula: datos.fechaMatricula,
          estado: 'MATRICULADO',
          updatedAt: new Date(),
        })
        .where(and(eq(matriculas.id, datos.matriculaId), eq(matriculas.colegioId, ctx.colegioId)))
        .returning({ id: matriculas.id });
      if (fila === undefined) throw new Error('No se pudo reactivar la matrícula');

      await tx
        .update(estudiantes)
        .set({ estado: EstadoEstudiante.MATRICULADO, updatedAt: new Date() })
        .where(
          and(eq(estudiantes.id, datos.estudianteId), eq(estudiantes.colegioId, ctx.colegioId)),
        );

      return fila.id;
    });
  }

  /**
   * Baja lógica: estado RETIRADO.
   *
   * Se permite en cualquier año —también en uno ya cerrado— porque una
   * secretaría puede estar corrigiendo un registro viejo; el service marca ese
   * caso como «corrección» en la auditoría, con el usuario que la hizo.
   *
   * Todo va en una transacción: si el estudiante se queda sin matrículas
   * vigentes, su ficha pasa a RETIRADO en el mismo movimiento, para que no
   * quede «matriculado» sin ninguna matrícula detrás.
   */
  async retirar(ctx: TenantContext, matriculaId: string): Promise<ResultadoRetiro> {
    return this.withTenant(ctx, async (tx) => {
      const [fila] = await tx
        .select({
          id: matriculas.id,
          estudianteId: matriculas.estudianteId,
          estado: matriculas.estado,
          anio: aniosLectivos.anio,
          estadoAnio: aniosLectivos.estado,
        })
        .from(matriculas)
        .innerJoin(aniosLectivos, eq(aniosLectivos.id, matriculas.anioLectivoId))
        .where(and(eq(matriculas.id, matriculaId), eq(matriculas.colegioId, ctx.colegioId)))
        .limit(1);

      if (fila === undefined) return SIN_RETIRO;
      // Ya estaba retirada: la baja es idempotente y no se vuelve a auditar.
      if (fila.estado === 'RETIRADO') {
        return { ...SIN_RETIRO, yaRetirada: true, anio: fila.anio };
      }

      await tx
        .update(matriculas)
        .set({ estado: 'RETIRADO', updatedAt: new Date() })
        .where(and(eq(matriculas.id, matriculaId), eq(matriculas.colegioId, ctx.colegioId)));

      // ¿Le queda alguna matrícula vigente, en este u otro año?
      const [restantes] = await tx
        .select({ total: sql<number>`count(*)` })
        .from(matriculas)
        .where(
          and(
            eq(matriculas.colegioId, ctx.colegioId),
            eq(matriculas.estudianteId, fila.estudianteId),
            inArray(matriculas.estado, ['INSCRITO', 'MATRICULADO']),
          ),
        );
      let estudianteRetirado = false;
      if (Number(restantes?.total ?? 0) === 0) {
        const [ficha] = await tx
          .update(estudiantes)
          .set({ estado: EstadoEstudiante.RETIRADO, updatedAt: new Date() })
          .where(
            and(eq(estudiantes.id, fila.estudianteId), eq(estudiantes.colegioId, ctx.colegioId)),
          )
          .returning({ id: estudiantes.id });
        estudianteRetirado = ficha !== undefined;
      }

      const vigente = await this.anioVigenteTx(tx, ctx);
      const correccion =
        fila.estadoAnio === 'CERRADO' || (vigente !== null && fila.anio < vigente.anio);

      return {
        retirada: true,
        yaRetirada: false,
        anio: fila.anio,
        correccion,
        estadoPrevio: fila.estado,
        estudianteRetirado,
      };
    });
  }
}
