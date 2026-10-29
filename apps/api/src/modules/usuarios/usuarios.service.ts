/**
 * UsuariosService — reglas del módulo Usuarios (personal del colegio).
 *
 * Decisiones:
 *  - Solo un admin puede crear/editar a otro admin.
 *  - Nunca se puede desactivar la propia cuenta ni dejar el colegio sin admin.
 *  - El correo debe ser del dominio institucional del colegio (login unificado).
 *  - Al crear o resetear la contraseña se devuelve una temporal UNA sola vez;
 *    en BD solo queda el hash y `debe_cambiar_password = true`.
 *  - Toda acción sensible se audita (Ley 1581 / AGENTS.md).
 */
import { Injectable, Logger } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import {
  ErrorCodes,
  type ActualizarUsuarioRequest,
  type CrearUsuarioRequest,
  type EstablecerPermisosRequest,
  type ListaUsuarios,
  type ListarUsuariosQuery,
  type PasswordRestablecida,
  type PermisoCatalogoItem,
  type TipoDocumento,
  type UsuarioCreado,
  type UsuarioListado,
} from '@eduplatform/types';
import { randomInt } from 'node:crypto';
import { apiError } from '../../shared/api-error';
import { AuditService } from '../../shared/audit.service';
import { RolesRepository } from '../roles/roles.repository';
import { PasswordService } from '../auth/password.service';
import { UsuariosRepository, type UsuarioRow } from './usuarios.repository';

/** Identidad del actor (usuario del colegio autenticado). */
export interface ActorUsuarios {
  colegioId: string;
  usuarioId: string;
  esAdmin: boolean;
}

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    private readonly repo: UsuariosRepository,
    private readonly roles: RolesRepository,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  private contexto(actor: ActorUsuarios): TenantContext {
    return { colegioId: actor.colegioId, isPlatformAdmin: false, userId: actor.usuarioId };
  }

  /** Listado paginado con búsqueda y permisos de cada usuario. */
  async listar(actor: ActorUsuarios, filtros: ListarUsuariosQuery): Promise<ListaUsuarios> {
    const contexto = this.contexto(actor);
    const normalizados = {
      ...filtros,
      page: filtros.page ?? 1,
      limit: filtros.limit ?? 20,
      estado: filtros.estado ?? 'todos',
    } as const;

    const { filas, total } = await this.repo.listar(contexto, normalizados);
    const permisos = await this.repo.permisosPorUsuario(
      contexto,
      filas.map((fila) => fila.id),
    );
    const roles = await this.roles.listar(contexto);
    const rolPorId = new Map(roles.map((rol) => [rol.id, rol.nombre]));
    const sedes = await this.repo.sedesPorUsuario(
      contexto,
      filas.map((fila) => fila.id),
    );
    return {
      items: filas.map((fila) =>
        this.aListado(fila, permisos.get(fila.id) ?? [], rolPorId, sedes.get(fila.id) ?? []),
      ),
      total,
      page: normalizados.page,
      limit: normalizados.limit,
    };
  }

  /** Catálogo completo de permisos (para el editor de la UI). */
  async catalogo(actor: ActorUsuarios): Promise<PermisoCatalogoItem[]> {
    return this.repo.catalogoPermisos(this.contexto(actor));
  }

  async detalle(actor: ActorUsuarios, id: string): Promise<UsuarioListado> {
    const contexto = this.contexto(actor);
    const fila = await this.repo.findPorId(contexto, id);
    if (fila === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Usuario no encontrado');
    const permisos = await this.repo.permisosPorUsuario(contexto, [fila.id]);
    const roles = await this.roles.listar(contexto);
    const rolPorId = new Map(roles.map((rol) => [rol.id, rol.nombre]));
    const sedes = await this.repo.sedesPorUsuario(contexto, [fila.id]);
    return this.aListado(fila, permisos.get(fila.id) ?? [], rolPorId, sedes.get(fila.id) ?? []);
  }

  /** Crea la cuenta con contraseña temporal y permisos iniciales. */
  async crear(actor: ActorUsuarios, dto: CrearUsuarioRequest): Promise<UsuarioCreado> {
    const contexto = this.contexto(actor);
    if (dto.esAdmin === true && !actor.esAdmin) {
      throw apiError(
        ErrorCodes.FORBIDDEN,
        403,
        'Solo un administrador del colegio puede crear otra cuenta de administrador',
      );
    }

    if (await this.repo.existeUsuario(contexto, dto.usuario)) {
      throw apiError(
        ErrorCodes.ALREADY_EXISTS,
        409,
        'Ya existe un usuario con ese nombre de usuario',
      );
    }
    if (
      (await this.repo.findPorDocumento(contexto, dto.tipoDocumento, dto.numeroDocumento)) !== null
    ) {
      throw apiError(ErrorCodes.ALREADY_EXISTS, 409, 'Ya existe un usuario con ese documento');
    }
    await this.validarPermisos(contexto, dto.permisos ?? []);
    const rolId = dto.rolId ?? null;
    if (!actor.esAdmin && (rolId !== null || (dto.permisos ?? []).length > 0)) {
      throw apiError(
        ErrorCodes.FORBIDDEN,
        403,
        'Solo el administrador del colegio puede asignar roles o permisos',
      );
    }
    if (rolId !== null && (await this.repo.findRol(contexto, rolId)) === null) {
      throw apiError(ErrorCodes.VALIDATION_ERROR, 400, 'El rol indicado no existe en el colegio');
    }
    await this.validarSedes(contexto, dto.alcance ?? 'TODAS', dto.sedesIds ?? []);

    const passwordTemporal = this.generarPasswordTemporal();
    const passwordHash = await this.passwords.hash(passwordTemporal);

    let creado: UsuarioRow;
    try {
      creado = await this.repo.crear(contexto, {
        usuario: dto.usuario,
        passwordHash,
        nombres: dto.nombres,
        apellidos: dto.apellidos,
        tipoDocumento: dto.tipoDocumento,
        numeroDocumento: dto.numeroDocumento,
        esAdmin: dto.esAdmin ?? false,
        rolId: dto.esAdmin === true ? null : rolId,
        alcance: dto.alcance ?? 'TODAS',
      });
    } catch (err) {
      this.rechazarDuplicado(err);
      throw err;
    }

    // El rol es la fuente de permisos: se proyectan a `usuarios_permisos`.
    // Si no hay rol (cuenta antigua) se aceptan permisos individuales.
    let permisos: string[];
    if (dto.esAdmin === true) {
      permisos = [];
    } else if (rolId !== null) {
      await this.roles.sincronizarProyeccion(contexto, rolId, actor.usuarioId);
      permisos = await this.permisosDeUsuario(contexto, creado);
    } else {
      permisos = await this.repo.reemplazarPermisos(
        contexto,
        creado.id,
        dto.permisos ?? [],
        actor.usuarioId,
      );
    }
    await this.repo.reemplazarSedes(contexto, creado.id, dto.sedesIds ?? []);

    await this.audit.registrar({
      accion: 'CREATE',
      entidad: 'usuarios',
      entidadId: creado.id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo: 'usuario creado',
        cambios: {
          usuario: { antes: null, despues: creado.usuario },
          esAdmin: { antes: null, despues: creado.esAdmin },
        },
      },
    });
    this.logger.log(`Usuario creado: ${creado.id} (colegio ${actor.colegioId})`);

    return {
      usuario: this.aListado(
        creado,
        permisos,
        await this.mapaRoles(contexto),
        await this.sedesDe(contexto, creado.id),
      ),
      passwordTemporal,
    };
  }

  /** Edita datos personales y/o activa-desactiva la cuenta. */
  async actualizar(
    actor: ActorUsuarios,
    id: string,
    dto: ActualizarUsuarioRequest,
  ): Promise<UsuarioListado> {
    const contexto = this.contexto(actor);
    const actual = await this.repo.findPorId(contexto, id);
    if (actual === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Usuario no encontrado');
    if (actual.esAdmin && !actor.esAdmin) {
      throw apiError(
        ErrorCodes.FORBIDDEN,
        403,
        'Solo un administrador puede editar a otro administrador',
      );
    }

    if (dto.activo === false) {
      if (actual.id === actor.usuarioId) {
        throw apiError(ErrorCodes.INVALID_INPUT, 400, 'No puedes desactivar tu propia cuenta');
      }
      if (actual.esAdmin && (await this.repo.cuentaAdminsActivos(contexto)) <= 1) {
        throw apiError(
          ErrorCodes.FORBIDDEN,
          403,
          'Debe quedar al menos un administrador activo en el colegio',
        );
      }
    }

    if (dto.usuario !== undefined && dto.usuario !== actual.usuario) {
      if (await this.repo.existeUsuario(contexto, dto.usuario, id)) {
        throw apiError(
          ErrorCodes.ALREADY_EXISTS,
          409,
          'Ya existe un usuario con ese correo electrónico',
        );
      }
    }

    if (dto.tipoDocumento !== undefined || dto.numeroDocumento !== undefined) {
      const tipo = dto.tipoDocumento ?? actual.tipoDocumento;
      const numero = dto.numeroDocumento ?? actual.numeroDocumento;
      // Un usuario puede estar sin documento (se completa después): nada que comparar.
      const existente =
        tipo === null || numero === null
          ? null
          : await this.repo.findPorDocumento(contexto, tipo, numero);
      if (existente !== null && existente.id !== id) {
        throw apiError(ErrorCodes.ALREADY_EXISTS, 409, 'Ya existe un usuario con ese documento');
      }
    }

    if (dto.rolId !== undefined) {
      if (!actor.esAdmin) {
        throw apiError(
          ErrorCodes.FORBIDDEN,
          403,
          'Solo el administrador del colegio cambia el rol',
        );
      }
      if (dto.rolId !== null && (await this.repo.findRol(contexto, dto.rolId)) === null) {
        throw apiError(ErrorCodes.VALIDATION_ERROR, 400, 'El rol indicado no existe en el colegio');
      }
    }
    if (dto.alcance !== undefined || dto.sedesIds !== undefined) {
      await this.validarSedes(contexto, dto.alcance ?? actual.alcance, dto.sedesIds ?? []);
    }

    let fila: UsuarioRow | null;
    try {
      fila = await this.repo.actualizar(contexto, id, dto);
    } catch (err) {
      this.rechazarDuplicado(err);
      throw err;
    }
    if (fila === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Usuario no encontrado');

    if (dto.rolId !== undefined) {
      if (dto.rolId === null) {
        await this.repo.reemplazarPermisos(contexto, id, [], actor.usuarioId);
      } else {
        await this.roles.sincronizarProyeccion(contexto, dto.rolId, actor.usuarioId);
      }
    }
    if (dto.alcance !== undefined || dto.sedesIds !== undefined) {
      const alcanceFinal = dto.alcance ?? fila.alcance;
      await this.repo.reemplazarSedes(
        contexto,
        id,
        alcanceFinal === 'ESPECIFICAS' ? (dto.sedesIds ?? []) : [],
      );
    }

    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'usuarios',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: {
        motivo: 'datos del usuario actualizados',
        cambios: Object.fromEntries(
          Object.entries(dto).map(([campo, despues]) => [
            campo,
            { antes: (actual as unknown as Record<string, unknown>)[campo] ?? null, despues },
          ]),
        ),
      },
    });

    const permisos = await this.repo.permisosPorUsuario(contexto, [id]);
    const roles = await this.roles.listar(contexto);
    const rolPorId = new Map(roles.map((rol) => [rol.id, rol.nombre]));
    const sedes = await this.repo.sedesPorUsuario(contexto, [id]);
    return this.aListado(fila, permisos.get(id) ?? [], rolPorId, sedes.get(id) ?? []);
  }

  /** Reemplaza los permisos del usuario (el admin no los necesita). */
  async establecerPermisos(
    actor: ActorUsuarios,
    id: string,
    dto: EstablecerPermisosRequest,
  ): Promise<UsuarioListado> {
    const contexto = this.contexto(actor);
    const actual = await this.repo.findPorId(contexto, id);
    if (actual === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Usuario no encontrado');
    if (actual.esAdmin) {
      throw apiError(
        ErrorCodes.INVALID_INPUT,
        400,
        'El administrador del colegio tiene todos los permisos; no requiere asignación',
      );
    }
    // S2 del informe: asignar permisos es potestad exclusiva del admin, y
    // nadie puede conceder algo que no tiene (regla de subconjunto).
    if (!actor.esAdmin) {
      throw apiError(
        ErrorCodes.FORBIDDEN,
        403,
        'Solo el administrador del colegio puede asignar permisos',
      );
    }
    await this.validarPermisos(contexto, dto.permisos);

    const aplicados = await this.repo.reemplazarPermisos(
      contexto,
      id,
      dto.permisos,
      actor.usuarioId,
    );
    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'usuarios',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: { motivo: 'permisos actualizados' },
    });
    return this.aListado(actual, aplicados);
  }

  /** Genera una nueva contraseña temporal y cierra las sesiones del usuario. */
  async resetearPassword(actor: ActorUsuarios, id: string): Promise<PasswordRestablecida> {
    const contexto = this.contexto(actor);
    const actual = await this.repo.findPorId(contexto, id);
    if (actual === null) throw apiError(ErrorCodes.NOT_FOUND, 404, 'Usuario no encontrado');
    if (actual.id === actor.usuarioId) {
      throw apiError(
        ErrorCodes.INVALID_INPUT,
        400,
        'Para tu propia cuenta usa la opción "Cambiar contraseña"',
      );
    }
    if (actual.esAdmin && !actor.esAdmin) {
      throw apiError(
        ErrorCodes.FORBIDDEN,
        403,
        'Solo un administrador puede resetear a otro administrador',
      );
    }

    const passwordTemporal = this.generarPasswordTemporal();
    const passwordHash = await this.passwords.hash(passwordTemporal);
    await this.repo.actualizarPasswordTemporal(contexto, id, passwordHash);
    await this.repo.revocarSesiones(contexto, id);

    await this.audit.registrar({
      accion: 'UPDATE',
      entidad: 'usuarios',
      entidadId: id,
      colegioId: actor.colegioId,
      usuarioId: actor.usuarioId,
      metadata: { motivo: 'contraseña restablecida por admin' },
    });
    return { passwordTemporal };
  }

  // ------------------------------------------------------------------
  // Reglas y utilidades
  // ------------------------------------------------------------------

  /** Todos los códigos deben existir en el catálogo (evita permisos fantasma). */
  private async validarPermisos(
    contexto: TenantContext,
    codigos: readonly string[],
  ): Promise<void> {
    if (codigos.length === 0) return;
    const catalogo = await this.repo.catalogoPermisos(contexto);
    const validos = new Set(catalogo.map((item) => item.codigo));
    const desconocidos = codigos.filter((codigo) => !validos.has(codigo));
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
  }

  /** Todas las sedes recibidas deben existir en el colegio. */
  private async validarSedes(
    contexto: TenantContext,
    alcance: 'TODAS' | 'ESPECIFICAS',
    sedesIds: readonly string[],
  ): Promise<void> {
    if (alcance === 'TODAS') return;
    if (sedesIds.length === 0) {
      throw apiError(
        ErrorCodes.VALIDATION_ERROR,
        400,
        'Elige al menos una sede para el alcance específico',
      );
    }
    const disponibles = new Set((await this.repo.sedesDelColegio(contexto)).map((sede) => sede.id));
    const ajenas = sedesIds.filter((sedeId) => !disponibles.has(sedeId));
    if (ajenas.length > 0) {
      throw apiError(ErrorCodes.VALIDATION_ERROR, 400, 'Hay sedes que no pertenecen al colegio', {
        sedes: ajenas,
      });
    }
  }

  /** Códigos proyectados en `usuarios_permisos` para una fila concreta. */
  private async permisosDeUsuario(ctx: TenantContext, fila: UsuarioRow): Promise<string[]> {
    const permisos = await this.repo.permisosPorUsuario(ctx, [fila.id]);
    return permisos.get(fila.id) ?? [];
  }

  /** Mapa id→nombre de los roles del colegio (para las respuestas). */
  private async mapaRoles(ctx: TenantContext): Promise<Map<string, string>> {
    const roles = await this.roles.listar(ctx);
    return new Map(roles.map((rol) => [rol.id, rol.nombre]));
  }

  /** Sedes asignadas a una persona, con nombre (alcance ESPECIFICAS). */
  private async sedesDe(
    ctx: TenantContext,
    usuarioId: string,
  ): Promise<{ id: string; nombre: string }[]> {
    const mapa = await this.repo.sedesPorUsuario(ctx, [usuarioId]);
    return mapa.get(usuarioId) ?? [];
  }

  /** Contraseña temporal legible: 12 caracteres con mayúscula, minúscula, dígito y símbolo. */
  private generarPasswordTemporal(): string {
    const mayusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const minusculas = 'abcdefghijkmnopqrstuvwxyz';
    const digitos = '23456789';
    const simbolos = '!@#$%&*';
    const todos = mayusculas + minusculas + digitos;
    const elegir = (conjunto: string): string => conjunto[randomInt(conjunto.length)] ?? 'x';

    const caracteres = [elegir(mayusculas), elegir(minusculas), elegir(digitos), elegir(simbolos)];
    while (caracteres.length < 12) caracteres.push(elegir(todos));

    // Mezcla Fisher-Yates para que los obligatorios no queden al inicio.
    for (let i = caracteres.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      const temporal = caracteres[i] ?? 'x';
      caracteres[i] = caracteres[j] ?? 'x';
      caracteres[j] = temporal;
    }
    return caracteres.join('');
  }

  /** Traduce la violación UNIQUE de Postgres a un 409 del contrato. */
  private rechazarDuplicado(err: unknown): void {
    if (typeof err === 'object' && err !== null && Reflect.get(err, 'code') === '23505') {
      throw apiError(ErrorCodes.ALREADY_EXISTS, 409, 'Ya existe un usuario con esos datos');
    }
  }

  private aListado(
    fila: UsuarioRow,
    permisos: string[],
    rolPorId: Map<string, string> = new Map(),
    sedes: { id: string; nombre: string }[] = [],
  ): UsuarioListado {
    return {
      id: fila.id,
      nombres: fila.nombres ?? '',
      apellidos: fila.apellidos ?? '',
      usuario: fila.usuario,
      tipoDocumento: fila.tipoDocumento as TipoDocumento,
      numeroDocumento: fila.numeroDocumento ?? '',
      esAdmin: fila.esAdmin,
      activo: fila.activo,
      debeCambiarPassword: fila.debeCambiarPassword,
      ultimoAcceso: fila.ultimoAcceso === null ? null : fila.ultimoAcceso.toISOString(),
      permisos: [...permisos].sort((a, b) => a.localeCompare(b)),
      rolId: fila.rolId,
      rolNombre: fila.rolId === null ? null : (rolPorId.get(fila.rolId) ?? null),
      alcance: fila.alcance,
      sedes,
    };
  }
}
