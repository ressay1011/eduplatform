/**
 * OnboardingService — reglas del wizard de configuración inicial.
 *
 * Solo el admin del colegio lo ejecuta. El mínimo para cerrar el wizard es
 * 1 sede con jornada + 1 curso; personal y estudiantes quedan como checklist.
 * Cada paso guarda avance (`onboarding_paso`) para poder reanudar.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import {
  ErrorCodes,
  type ColegioOnboardingRequest,
  type EstadoOnboarding,
  type EstructuraOnboardingRequest,
  type SedeOnboardingRequest,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import { AuditService } from '../../shared/audit.service';
import { OnboardingRepository, type FotoOnboarding } from './onboarding.repository';

export interface ActorOnboarding {
  colegioId: string;
  usuarioId: string;
  esAdmin: boolean;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly repo: OnboardingRepository,
    private readonly audit: AuditService,
  ) {}

  private contexto(actor: ActorOnboarding): TenantContext {
    return { colegioId: actor.colegioId, isPlatformAdmin: false, userId: actor.usuarioId };
  }

  private asegurarAdmin(actor: ActorOnboarding): void {
    if (!actor.esAdmin) {
      throw apiError(
        ErrorCodes.FORBIDDEN,
        403,
        'Solo el administrador del colegio puede configurar la institución',
      );
    }
  }

  /** Estado completo (una llamada alimenta los 6 pasos). */
  async estado(actor: ActorOnboarding): Promise<EstadoOnboarding> {
    this.asegurarAdmin(actor);
    const foto = await this.repo.foto(this.contexto(actor));
    return this.aEstado(foto);
  }

  private aEstado(foto: FotoOnboarding): EstadoOnboarding {
    if (foto.colegio === null) {
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'Colegio no encontrado');
    }
    const colegio = foto.colegio;
    const sedesConJornada = foto.sedes.filter((s) => s.jornadas.length > 0).length;

    return {
      completado: colegio.onboardingCompletadoEn !== null,
      paso: colegio.onboardingPaso,
      colegio: {
        id: colegio.id,
        nombre: colegio.nombre,
        nit: colegio.nit,
        codigoDane: colegio.codigoDane,
        subdominio: colegio.subdominio,
        dominioEmail: colegio.dominioEmail,
        municipio: colegio.municipio,
        departamento: colegio.departamento,
        direccion: colegio.direccion,
        telefono: colegio.telefono,
        email: colegio.email,
        calendario: colegio.calendario,
      },
      sedes: foto.sedes,
      anioLectivo: foto.anio,
      periodos: foto.periodos,
      estructura: { grados: foto.conteos.grados, cursos: foto.conteos.cursos },
      personal: { total: foto.conteos.personal },
      estudiantes: {
        total: foto.conteos.estudiantes,
        matriculados: foto.conteos.matriculados,
      },
      checklist: [
        {
          clave: 'sedes',
          titulo: 'Sedes y jornadas',
          detalle: `${sedesConJornada} de ${foto.sedes.length} sede(s) con jornada`,
          hecho: foto.sedes.length > 0 && sedesConJornada === foto.sedes.length,
        },
        {
          clave: 'cursos',
          titulo: 'Cursos creados',
          detalle: `${foto.conteos.cursos} curso(s) en ${foto.conteos.grados} grado(s)`,
          hecho: foto.conteos.cursos > 0,
        },
        {
          clave: 'personal',
          titulo: 'Agrega al equipo',
          detalle:
            foto.conteos.personal > 1
              ? `${foto.conteos.personal - 1} persona(s) además del admin`
              : 'Solo está el administrador',
          hecho: foto.conteos.personal > 1,
        },
        {
          clave: 'estudiantes',
          titulo: 'Cargar estudiantes',
          detalle: `${foto.conteos.matriculados} de ${foto.conteos.estudiantes} matriculado(s)`,
          hecho: foto.conteos.matriculados > 0,
        },
        {
          clave: 'roles',
          titulo: 'Revisar roles y permisos',
          detalle: `${foto.conteos.roles} rol(es) configurado(s)`,
          hecho: foto.conteos.roles >= 5,
        },
      ],
    };
  }

  /** Paso 1. */
  async guardarColegio(
    actor: ActorOnboarding,
    datos: ColegioOnboardingRequest,
  ): Promise<EstadoOnboarding> {
    this.asegurarAdmin(actor);
    try {
      await this.repo.guardarColegio(this.contexto(actor), {
        ...datos,
        periodos: datos.periodos,
      });
    } catch (error) {
      if (this.esUnico(error)) {
        throw apiError(
          ErrorCodes.ALREADY_EXISTS,
          409,
          'El código DANE, el subdominio o el dominio de correo ya están en uso',
        );
      }
      throw error;
    }

    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'colegios',
      entidadId: actor.colegioId,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: { motivo: 'onboarding paso 1 (identidad y períodos)' },
    });

    return this.estado(actor);
  }

  /** Paso 2. */
  async guardarSede(
    actor: ActorOnboarding,
    datos: SedeOnboardingRequest,
  ): Promise<EstadoOnboarding> {
    this.asegurarAdmin(actor);
    const sedeId = await this.repo.guardarSede(this.contexto(actor), datos);
    if (sedeId === null) {
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'Sede no encontrada');
    }

    await this.audit.registrar({
      accion: datos.id === undefined ? 'CREATE' : 'UPDATE',
      entidad: 'sedes',
      entidadId: sedeId,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: { motivo: 'onboarding paso 2 (sede y jornadas)' },
    });

    return this.estado(actor);
  }

  /** Paso 3: generador de cursos. */
  async generarEstructura(
    actor: ActorOnboarding,
    datos: EstructuraOnboardingRequest,
  ): Promise<EstadoOnboarding> {
    this.asegurarAdmin(actor);
    const contexto = this.contexto(actor);

    const sede = await this.repo.sedeConAnio(contexto, datos.sedeId);
    if (sede === null) {
      throw apiError(ErrorCodes.NOT_FOUND, 404, 'Sede no encontrada');
    }
    if (sede.anioId === null) {
      throw apiError(
        ErrorCodes.CONFLICT,
        409,
        'Primero completa el paso 1: año lectivo y períodos',
      );
    }
    if (!sede.jornadas.includes(datos.jornada)) {
      throw apiError(ErrorCodes.INVALID_INPUT, 400, 'Esa jornada no está declarada en la sede');
    }

    const resultado = await this.repo.generarEstructura(contexto, datos, sede.anioId);

    await this.audit.registrar({
      accion: 'CREATE',
      entidad: 'grupos',
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo: 'onboarding paso 3 (generador de cursos)',
        cambios: { creados: { antes: 0, despues: resultado.creados } },
      },
    });

    return this.estado(actor);
  }

  /** Paso 6: valida el mínimo y cierra el wizard. */
  async finalizar(actor: ActorOnboarding): Promise<EstadoOnboarding> {
    this.asegurarAdmin(actor);
    const contexto = this.contexto(actor);
    const { sedesConJornada, cursos } = await this.repo.minimo(contexto);

    if (sedesConJornada === 0) {
      throw apiError(
        ErrorCodes.CONFLICT,
        409,
        'Agrega al menos una sede con su jornada antes de entrar al dashboard',
      );
    }
    if (cursos === 0) {
      throw apiError(
        ErrorCodes.CONFLICT,
        409,
        'Genera al menos un curso antes de entrar al dashboard',
      );
    }

    await this.repo.finalizar(contexto);
    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'colegios',
      entidadId: actor.colegioId,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: { motivo: 'onboarding finalizado' },
    });

    return this.estado(actor);
  }

  /** «Guardar y salir»: recuerda el paso sin cerrar el wizard. */
  async guardarPaso(actor: ActorOnboarding, paso: number): Promise<EstadoOnboarding> {
    this.asegurarAdmin(actor);
    await this.repo.marcarPaso(this.contexto(actor), paso);
    return this.estado(actor);
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
