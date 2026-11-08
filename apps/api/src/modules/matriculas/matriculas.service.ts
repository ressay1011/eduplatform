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
  hoyLocal,
  type CrearMatriculaDatos,
  type CursoMatricula,
  type ImportarMatriculasRequest,
  type ListaMatriculas,
  type ListarMatriculasQuery,
  type MatriculaCreada,
  type ResultadoImportacionMatriculas,
  type TipoDocumento,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import { AuditService } from '../../shared/audit.service';
import { esViolacionUnica } from '../../shared/pg-errors';
import {
  condicionDeTexto,
  ErrorMatricula,
  resolverCursoCsv,
  tipoDocumentoDeTexto,
} from './matriculas.curso';
import { MatriculasRepository, type ResultadoFilaImportada } from './matriculas.repository';

export interface ActorMatriculas {
  colegioId: string;
  usuarioId: string;
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
    // Un año cerrado ya no admite altas: la matrícula quedaría en un año que la
    // secretaría dio por terminado (las bajas sí se permiten, como corrección).
    if (curso.estadoAnio === 'CERRADO') {
      throw apiError(
        ErrorCodes.CONFLICT,
        409,
        `El año lectivo ${curso.anio} está cerrado: no admite matrículas nuevas`,
      );
    }

    const estudiante = await this.repo.estudiantePorId(contexto, dto.estudianteId);
    if (estudiante === null) {
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'El estudiante no existe en este colegio');
    }

    const fecha = dto.fechaMatricula ?? hoyLocal();
    const existente = await this.repo.matriculaDe(contexto, dto.estudianteId, curso.anioLectivoId);
    let id: string;
    let estadoPrevio: string | null = null;

    if (existente !== null) {
      // El UNIQUE (año, estudiante) impide crear otra fila: si la que hay está
      // retirada o anulada, el reingreso la reactiva. Si sigue viva, es un 409.
      if (existente.estado !== 'RETIRADO' && existente.estado !== 'ANULADO') {
        throw apiError(
          ErrorCodes.ALREADY_EXISTS,
          409,
          `El estudiante ya tiene matrícula en ${curso.anio} (${existente.estado}). Para cambiarlo de curso, retira la actual.`,
        );
      }
      estadoPrevio = existente.estado;
      id = await this.repo.reactivar(contexto, {
        matriculaId: existente.id,
        estudianteId: dto.estudianteId,
        cursoId: curso.id,
        anioLectivoId: curso.anioLectivoId,
        condicion: dto.condicion,
        fechaMatricula: fecha,
      });
    } else {
      try {
        id = await this.repo.crear(contexto, {
          estudianteId: dto.estudianteId,
          cursoId: curso.id,
          anioLectivoId: curso.anioLectivoId,
          condicion: dto.condicion,
          fechaMatricula: fecha,
        });
      } catch (error) {
        if (esViolacionUnica(error)) {
          throw apiError(ErrorCodes.ALREADY_EXISTS, 409, 'El estudiante ya está matriculado');
        }
        throw error;
      }
    }

    await this.audit.registrar({
      accion: 'CREATE',
      entidad: 'matriculas',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo:
          estadoPrevio === null
            ? `Matrícula individual en ${curso.anio}`
            : `Reactivación de matrícula en ${curso.anio} (estaba ${estadoPrevio})`,
        ...(estadoPrevio === null
          ? {}
          : { cambios: { estado: { antes: estadoPrevio, despues: 'MATRICULADO' } } }),
      },
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
        const condicion = this.condicionDeLaFila(fila.condicion);
        const tipoDocumento = this.tipoDocumentoDeLaFila(fila.tipoDocumento);
        // Una sola transacción por fila: ficha, matrícula y estado del
        // estudiante se confirman juntos o no se confirman (antes la ficha se
        // creaba en su propia transacción y podía quedar sin matrícula).
        const resultado = await this.repo.matricularDesdeCsv(contexto, {
          documento: fila.documento,
          cursoId: curso.id,
          anioLectivoId: curso.anioLectivoId,
          condicion,
          fechaMatricula: hoyLocal(),
          ...(fila.fechaNacimiento === undefined ? {} : { fechaNacimiento: fila.fechaNacimiento }),
          ...(tipoDocumento === undefined ? {} : { tipoDocumento }),
        });
        if (resultado.estado !== 'creada') {
          throw new ErrorMatricula(this.mensajeDeFila(resultado, fila.documento, curso.anio));
        }
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

  /**
   * Baja lógica de la matrícula.
   *
   * Se permite también en años anteriores o cerrados: es una corrección y queda
   * en `audit_log` con el usuario que la hizo (la auditoría guarda `usuario_id`),
   * el año y el estado del que venía.
   */
  async retirar(actor: ActorMatriculas, id: string): Promise<{ id: string }> {
    const contexto = this.contexto(actor);
    const resultado = await this.repo.retirar(contexto, id);
    if (!resultado.retirada) {
      // Retirar dos veces no es un error: la segunda vez no cambia nada.
      if (resultado.yaRetirada) return { id };
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'Matrícula no encontrada');
    }

    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'matriculas',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo: resultado.correccion
          ? `Corrección: baja de matrícula de ${resultado.anio} (año anterior o cerrado)`
          : `Baja de matrícula en ${resultado.anio}`,
        cambios: {
          estado: { antes: resultado.estadoPrevio, despues: 'RETIRADO' },
          ...(resultado.estudianteRetirado
            ? { estudiante: { antes: 'MATRICULADO', despues: 'RETIRADO' } }
            : {}),
        },
      },
    });
    return { id };
  }

  /** Motivo legible de una fila: el de negocio se muestra tal cual. */
  private motivo(error: unknown): string {
    if (error instanceof ErrorMatricula) return error.message;
    if (esViolacionUnica(error)) return 'Ya existe la matrícula del estudiante en ese año';
    return 'No se pudo matricular la fila (error inesperado)';
  }

  /**
   * Condición de la fila: vacía → `NUEVO` (los CSV viejos no la traen); texto
   * no reconocido → error de esa fila, con las opciones a la vista.
   */
  private condicionDeLaFila(texto: string | undefined): CondicionMatricula {
    if (texto === undefined || texto === '') return CondicionMatricula.NUEVO;
    const condicion = condicionDeTexto(texto);
    if (condicion === null) {
      throw new ErrorMatricula(
        `Condición inválida: «${texto}» (usa NUEVO, ANTIGUO, REPITENTE, REINGRESO o TRASLADADO)`,
      );
    }
    return condicion;
  }

  /**
   * Tipo de documento de la fila: vacío → sin filtro (el documento es único);
   * texto no reconocido → error de esa fila.
   */
  private tipoDocumentoDeLaFila(texto: string | undefined): TipoDocumento | undefined {
    if (texto === undefined || texto === '') return undefined;
    const tipo = tipoDocumentoDeTexto(texto);
    if (tipo === null) {
      throw new ErrorMatricula(
        `Tipo de documento inválido: «${texto}» (usa CC, TI, CE, RC, PEP o PPT)`,
      );
    }
    return tipo;
  }

  /**
   * Traduce el hecho que devolvió el repositorio al texto que ve el usuario.
   * Los mensajes son los mismos de siempre: el repositorio solo dice qué pasó.
   */
  private mensajeDeFila(
    resultado: Exclude<ResultadoFilaImportada, { estado: 'creada' }>,
    documento: string,
    anio: number,
  ): string {
    switch (resultado.estado) {
      case 'sin-cuenta':
        return `No existe una cuenta con el documento ${documento}`;
      case 'documento-ambiguo':
        return `Hay varias cuentas con el documento ${documento}: agrega la columna tipoDocumento (CC, TI, CE, RC, PEP o PPT)`;
      case 'cuenta-sin-rol-estudiante':
        return `La cuenta ${documento} no tiene rol de estudiante`;
      case 'falta-fecha-nacimiento':
        return 'Falta fechaNacimiento: el estudiante no tiene ficha y el CSV debe traerla';
      case 'ficha-no-creada':
        return 'No se pudo crear la ficha del estudiante';
      case 'ya-matriculado':
        return `El estudiante ya tiene matrícula en ${anio}`;
    }
  }
}
