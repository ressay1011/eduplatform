/**
 * MatriculasService — reglas del módulo Matrículas.
 *
 * - Un estudiante tiene UNA matrícula por año lectivo (UNIQUE en BD).
 * - Solo se matriculan estudiantes que ya tienen cuenta y ficha en el colegio;
 *   la importación crea la ficha (`estudiantes`) si la cuenta existe y la fila
 *   trae la fecha de nacimiento, pero NUNCA crea cuentas nuevas.
 * - La baja es lógica (`estado = RETIRADO`), nunca un DELETE.
 * - La importación es «todo o nada por fila»: las válidas se crean y las
 *   inválidas vuelven en `errores` con su número de fila.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import {
  CondicionMatricula,
  ErrorCodes,
  type CrearMatriculaDatos,
  type CursoMatricula,
  type ImportarMatriculasRequest,
  type ListaMatriculas,
  type ListarMatriculasQuery,
  type MatriculaCreada,
  type ResultadoImportacionMatriculas,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import { AuditService } from '../../shared/audit.service';
import { ErrorMatricula, resolverCursoCsv } from './matriculas.curso';
import { MatriculasRepository } from './matriculas.repository';

export interface ActorMatriculas {
  colegioId: string;
  usuarioId: string;
}

/** Fecha de hoy en ISO corto (la matrícula es un dato de calendario, no una hora). */
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class MatriculasService {
  constructor(
    private readonly repo: MatriculasRepository,
    private readonly audit: AuditService,
  ) {}

  private contexto(actor: ActorMatriculas): TenantContext {
    return { colegioId: actor.colegioId, isPlatformAdmin: false, userId: actor.usuarioId };
  }

  /** Cursos del año vigente (para la vista previa del CSV). */
  cursos(actor: ActorMatriculas): Promise<CursoMatricula[]> {
    return this.repo.cursos(this.contexto(actor));
  }

  listar(actor: ActorMatriculas, filtros: ListarMatriculasQuery): Promise<ListaMatriculas> {
    return this.repo.listar(this.contexto(actor), filtros);
  }

  /** Alta individual de un estudiante que ya existe. */
  async crear(actor: ActorMatriculas, dto: CrearMatriculaDatos): Promise<MatriculaCreada> {
    const contexto = this.contexto(actor);
    const curso = await this.repo.cursoPorId(contexto, dto.cursoId);
    if (curso === null) {
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'El curso no existe en este colegio');
    }

    const estudiante = await this.repo.estudiantePorId(contexto, dto.estudianteId);
    if (estudiante === null) {
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'El estudiante no existe en este colegio');
    }

    const existente = await this.repo.matriculaDe(contexto, dto.estudianteId, curso.anioLectivoId);
    if (existente !== null) {
      throw apiError(
        ErrorCodes.ALREADY_EXISTS,
        409,
        `El estudiante ya tiene matrícula en ${curso.anio}`,
      );
    }

    let id: string;
    try {
      id = await this.repo.crear(contexto, {
        estudianteId: dto.estudianteId,
        cursoId: curso.id,
        anioLectivoId: curso.anioLectivoId,
        condicion: dto.condicion,
        fechaMatricula: dto.fechaMatricula ?? hoy(),
      });
    } catch (error) {
      if (this.esUnico(error)) {
        throw apiError(ErrorCodes.ALREADY_EXISTS, 409, 'El estudiante ya está matriculado');
      }
      throw error;
    }

    await this.audit.registrar({
      accion: 'CREATE',
      entidad: 'matriculas',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: { motivo: `Matrícula individual en ${curso.anio}` },
    });

    return { id };
  }

  /** Importación del CSV del onboarding (paso 5). */
  async importar(
    actor: ActorMatriculas,
    dto: ImportarMatriculasRequest,
  ): Promise<ResultadoImportacionMatriculas> {
    const contexto = this.contexto(actor);
    const cursos = await this.repo.cursos(contexto);
    const primero = cursos[0];
    if (primero === undefined) {
      throw apiError(
        ErrorCodes.CONFLICT,
        409,
        'Primero genera los cursos del año lectivo (paso 3)',
      );
    }

    const errores: { fila: number; motivo: string }[] = [];
    let creadas = 0;

    for (const [indice, fila] of dto.filas.entries()) {
      try {
        const curso = resolverCursoCsv(cursos, fila);
        const cuenta = await this.repo.buscarCuentaPorDocumento(contexto, fila.documento);
        if (cuenta === null) {
          throw new ErrorMatricula(`No existe una cuenta con el documento ${fila.documento}`);
        }

        let estudianteId = cuenta.estudianteId;
        if (estudianteId === null) {
          if (cuenta.rolTipoPersona !== 'ESTUDIANTE') {
            throw new ErrorMatricula(`La cuenta ${fila.documento} no tiene rol de estudiante`);
          }
          if (fila.fechaNacimiento === undefined) {
            throw new ErrorMatricula(
              'Falta fechaNacimiento: el estudiante no tiene ficha y el CSV debe traerla',
            );
          }
          estudianteId = await this.repo.crearPerfilEstudiante(contexto, {
            usuarioId: cuenta.usuarioId,
            codigoMatricula: fila.documento,
            fechaNacimiento: fila.fechaNacimiento,
          });
          if (estudianteId === null) {
            throw new ErrorMatricula('No se pudo crear la ficha del estudiante');
          }
        }

        const existente = await this.repo.matriculaDe(contexto, estudianteId, curso.anioLectivoId);
        if (existente !== null) {
          throw new ErrorMatricula(`El estudiante ya tiene matrícula en ${curso.anio}`);
        }

        await this.repo.crear(contexto, {
          estudianteId,
          cursoId: curso.id,
          anioLectivoId: curso.anioLectivoId,
          condicion: CondicionMatricula.NUEVO,
          fechaMatricula: hoy(),
        });
        creadas += 1;
      } catch (error) {
        errores.push({ fila: indice + 1, motivo: this.motivo(error) });
      }
    }

    await this.audit.registrar({
      accion: 'CREATE',
      entidad: 'matriculas',
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo: 'Importación CSV (onboarding paso 5)',
        cambios: { creados: { antes: 0, despues: creadas } },
      },
    });

    return { creadas, errores };
  }

  /** Baja lógica de la matrícula. */
  async retirar(actor: ActorMatriculas, id: string): Promise<{ id: string }> {
    const contexto = this.contexto(actor);
    const retirada = await this.repo.retirar(contexto, id);
    if (!retirada) {
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'Matrícula no encontrada');
    }
    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'matriculas',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: { motivo: 'Baja de matrícula (estado RETIRADO)' },
    });
    return { id };
  }

  /** Motivo legible de una fila: el de negocio se muestra tal cual. */
  private motivo(error: unknown): string {
    if (error instanceof ErrorMatricula) return error.message;
    if (this.esUnico(error)) return 'Ya existe la matrícula del estudiante en ese año';
    return 'No se pudo matricular la fila (error inesperado)';
  }

  /** 23505 = unique_violation de Postgres (drizzle lo deja en `cause`). */
  private esUnico(error: unknown): boolean {
    const codigo = (posible: unknown): unknown =>
      typeof posible === 'object' && posible !== null && 'code' in posible
        ? (posible as { code?: unknown }).code
        : undefined;
    return (
      codigo(error) === '23505' || codigo((error as { cause?: unknown } | null)?.cause) === '23505'
    );
  }
}
