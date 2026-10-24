/**
 * RolesService — reglas del módulo Personas → Roles.
 *
 * Decisiones:
 *  - El rol es la única fuente de permisos; `usuarios_permisos` es su
 *    proyección y se resincroniza al crear/editar el rol.
 *  - Los 5 roles predeterminados se pueden editar pero no borrar.
 *  - Un rol en uso no se borra: el admin debe reasignar primero.
 *  - Todo cambio sensible se audita (Ley 1581).
 */
import { Injectable, Logger } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import {
  ErrorCodes,
  type ActualizarRolRequest,
  type CrearRolRequest,
  type ListaRoles,
  type RolListado,
  type TipoPersonaRol,
} from '@eduplatform/types';
import { apiError } from '../../shared/api-error';
import { AuditService } from '../../shared/audit.service';
import { RolesRepository } from './roles.repository';

/** Identidad del actor (usuario del colegio autenticado). */
export interface ActorRoles {
  colegioId: string;
  usuarioId: string;
  esAdmin: boolean;
}

/** Datos ya validados por Zod (defaults aplicados). */
export interface DatosRol {
  nombre: string;
  descripcion?: string | undefined;
  tipoPersona: TipoPersonaRol;
  permisos: string[];
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly repo: RolesRepository,
    private readonly audit: AuditService,
  ) {}

  private contexto(actor: ActorRoles): TenantContext {
    return { colegioId: actor.colegioId, isPlatformAdmin: false, userId: actor.usuarioId };
  }

  async listar(actor: ActorRoles): Promise<ListaRoles> {
    return { items: await this.repo.listar(this.contexto(actor)) };
  }

  /** Sedes disponibles para el alcance de una persona. */
  async sedes(actor: ActorRoles): Promise<{ id: string; nombre: string }[]> {
    return this.repo.sedes(this.contexto(actor));
  }

  async crear(actor: ActorRoles, datos: DatosRol): Promise<RolListado> {
    const contexto = this.contexto(actor);
    await this.validarNombre(contexto, datos.nombre);

    const creado = await this.repo.crear(contexto, {
      nombre: datos.nombre,
      descripcion: datos.descripcion ?? null,
      tipoPersona: datos.tipoPersona,
    });
    await this.aplicarPermisos(contexto, creado.id, datos.permisos, actor.usuarioId);

    await this.audit.registrar({
      accion: 'CREATE',
      entidad: 'roles',
      entidadId: creado.id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo: 'rol creado',
        cambios: { nombre: { antes: null, despues: creado.nombre } },
      },
    });
    this.logger.log(`Rol creado: ${creado.id}`);
    return this.exigirRol(contexto, creado.id);
  }

  async actualizar(
    actor: ActorRoles,
    id: string,
    datos: ActualizarRolRequest,
  ): Promise<RolListado> {
    const contexto = this.contexto(actor);
    const actual = await this.repo.findPorId(contexto, id);
    if (actual === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Rol no encontrado');

    if (datos.nombre !== undefined && datos.nombre !== actual.nombre) {
      await this.validarNombre(contexto, datos.nombre, id);
    }

    const fila = await this.repo.actualizar(contexto, id, {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      tipoPersona: datos.tipoPersona,
      activo: datos.activo,
    });
    if (fila === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Rol no encontrado');

    if (datos.permisos !== undefined) {
      await this.aplicarPermisos(contexto, id, datos.permisos, actor.usuarioId);
    }

    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'roles',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo: 'rol actualizado',
        cambios: {
          nombre: { antes: actual.nombre, despues: fila.nombre },
          permisos: { antes: actual.permisos, despues: datos.permisos ?? actual.permisos },
        },
      },
    });
    return this.exigirRol(contexto, id);
  }

  /** Duplica un rol con otro nombre (misma configuración). */
  async duplicar(actor: ActorRoles, id: string): Promise<RolListado> {
    const contexto = this.contexto(actor);
    const original = await this.repo.findPorId(contexto, id);
    if (original === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Rol no encontrado');

    const nombre = await this.nombreLibre(contexto, `Copia de ${original.nombre}`);
    return this.crear(actor, {
      nombre,
      ...(original.descripcion !== null ? { descripcion: original.descripcion } : {}),
      tipoPersona: original.tipoPersona,
      permisos: original.permisos,
    });
  }

  async eliminar(actor: ActorRoles, id: string): Promise<{ id: string }> {
    const contexto = this.contexto(actor);
    const rol = await this.repo.findPorId(contexto, id);
    if (rol === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Rol no encontrado');
    if (rol.esPredeterminado) {
      throw apiError(
        ErrorCodes.INVALID_INPUT,
        400,
        'Los roles predeterminados no se eliminan; puedes editarlos o desactivarlos',
      );
    }
    if (rol.personas > 0) {
      throw apiError(
        ErrorCodes.ALREADY_EXISTS,
        409,
        `El rol tiene ${rol.personas} persona(s) asignada(s); reasígnalas antes de eliminarlo`,
        { personas: rol.personas },
      );
    }

    await this.repo.eliminar(contexto, id);
    await this.audit.registrar({
      accion: 'DELETE',
      entidad: 'roles',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo: 'rol eliminado',
        cambios: { nombre: { antes: rol.nombre, despues: null } },
      },
    });
    return { id };
  }

  // ------------------------------------------------------------------
  // Reglas y utilidades
  // ------------------------------------------------------------------

  private async validarNombre(
    ctx: TenantContext,
    nombre: string,
    exceptoId?: string,
  ): Promise<void> {
    if (await this.repo.existeNombre(ctx, nombre, exceptoId)) {
      throw apiError(ErrorCodes.ALREADY_EXISTS, 409, 'Ya existe un rol con ese nombre');
    }
  }

  private async nombreLibre(ctx: TenantContext, base: string): Promise<string> {
    for (let intento = 1; intento <= 20; intento += 1) {
      const candidato = intento === 1 ? base : `${base} (${intento})`;
      if (!(await this.repo.existeNombre(ctx, candidato))) return candidato;
    }
    throw apiError(
      ErrorCodes.ALREADY_EXISTS,
      409,
      'No se pudo generar un nombre libre para la copia',
    );
  }

  /** Aplica permisos y resincroniza la proyección de las personas con el rol. */
  private async aplicarPermisos(
    ctx: TenantContext,
    rolId: string,
    codigos: readonly string[],
    asignadoPorId: string,
  ): Promise<void> {
    const aplicados = await this.repo.reemplazarPermisos(ctx, rolId, codigos);
    const aplicadosSet = new Set(aplicados);
    const desconocidos = codigos.filter((codigo) => !aplicadosSet.has(codigo));
    if (desconocidos.length > 0) {
      throw apiError(
        ErrorCodes.VALIDATION_ERROR,
        400,
        'Hay permisos que no existen en el catálogo',
        {
          permisos: desconocidos,
        },
      );
    }
    await this.repo.sincronizarProyeccion(ctx, rolId, asignadoPorId);
  }

  private async exigirRol(ctx: TenantContext, id: string): Promise<RolListado> {
    const rol = await this.repo.findPorId(ctx, id);
    if (rol === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Rol no encontrado');
    return rol;
  }
}

/** Tipo del request tal como lo entrega el controller (defaults aplicados). */
export type DatosCrearRol = CrearRolRequest;
