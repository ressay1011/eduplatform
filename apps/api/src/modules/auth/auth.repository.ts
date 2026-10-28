/**
 * AuthRepository — acceso a datos del módulo auth (solo DB, sin HttpException).
 *
 * Nota multi-tenant: el login y la validación de sesión ocurren ANTES de
 * conocer el colegio activo; esas dos lecturas usan las vistas pre-tenant
 * `colegios_publico` / `sesiones_auth` (SQL con justificación: columnas
 * públicas explícitas — ver sql/0001_rls_policies.sql §6). Todo lo demás
 * corre dentro de `withTenant` con filtro explícito por colegio_id.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import {
  colegios,
  permisos,
  plataformaUsuarios,
  sesiones,
  usuarios,
  usuariosPermisos,
} from '@eduplatform/database';
import { BaseRepository } from '../../shared/base.repository';

/** Fila de la vista `colegios_publico` (solo branding/estado). */
export interface ColegioPublicoRow {
  id: string;
  nombre: string;
  codigoDane: string;
  subdominio: string;
  /** Dominio de correo institucional (resuelve el colegio en el login). */
  dominioEmail: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  estado: string;
  municipio: string;
  departamento: string;
}

/** Fila de la vista `sesiones_auth`. */
export interface SesionAuthRow {
  id: string;
  colegioId: string | null;
  usuarioId: string | null;
  plataformaUsuarioId: string | null;
  expiraEn: Date;
  revocadaEn: Date | null;
  ultimaActividadEn: Date;
}

/** Usuario de colegio con los campos que el auth necesita (incluye hash). */
export interface UsuarioAuthRow {
  id: string;
  colegioId: string;
  usuario: string;
  passwordHash: string;
  nombres: string;
  apellidos: string;
  esAdmin: boolean;
  activo: boolean;
  debeCambiarPassword: boolean;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
}

/** Colegio con los campos que el auth necesita. */
export interface ColegioAuthRow {
  id: string;
  nombre: string;
  codigoDane: string;
  subdominio: string;
  primaryColor: string | null;
  estado: string;
}

/** Usuario de plataforma con los campos que el auth necesita (incluye hash). */
export interface PlataformaUsuarioRow {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: string;
  activo: boolean;
  passwordHash: string;
}

const USUARIO_COLUMNS = {
  id: usuarios.id,
  colegioId: usuarios.colegioId,
  usuario: usuarios.usuario,
  passwordHash: usuarios.passwordHash,
  nombres: usuarios.nombres,
  apellidos: usuarios.apellidos,
  esAdmin: usuarios.esAdmin,
  activo: usuarios.activo,
  debeCambiarPassword: usuarios.debeCambiarPassword,
  intentosFallidos: usuarios.intentosFallidos,
  bloqueadoHasta: usuarios.bloqueadoHasta,
} as const;

const COLEGIO_COLUMNS = {
  id: colegios.id,
  nombre: colegios.nombre,
  codigoDane: colegios.codigoDane,
  subdominio: colegios.subdominio,
  primaryColor: colegios.primaryColor,
  estado: colegios.estado,
} as const;

const PLATAFORMA_COLUMNS = {
  id: plataformaUsuarios.id,
  email: plataformaUsuarios.email,
  nombreCompleto: plataformaUsuarios.nombreCompleto,
  rol: plataformaUsuarios.rol,
  activo: plataformaUsuarios.activo,
  passwordHash: plataformaUsuarios.passwordHash,
} as const;

@Injectable()
export class AuthRepository extends BaseRepository {
  // ------------------------------------------------------------------
  // Lecturas pre-tenant (vistas) — login y validación de sesión
  // ------------------------------------------------------------------

  /** Colegio por subdominio, con solo los datos públicos del login. */
  async findColegioPublico(subdominio: string): Promise<ColegioPublicoRow | null> {
    const filas = await this.db.execute(
      sql`SELECT id, nombre, subdominio, dominio_email, codigo_dane, logo_url, primary_color, estado, municipio, departamento
          FROM colegios_publico WHERE subdominio = ${subdominio} LIMIT 1`,
    );
    return this.mapearColegioPublico(filas[0]);
  }

  /**
   * Colegio por dominio de correo institucional (login unificado).
   * El dominio es único, así que hay como máximo un colegio por dominio.
   */
  async findColegioPublicoPorDominio(dominio: string): Promise<ColegioPublicoRow | null> {
    const filas = await this.db.execute(
      sql`SELECT id, nombre, subdominio, dominio_email, codigo_dane, logo_url, primary_color, estado, municipio, departamento
          FROM colegios_publico WHERE dominio_email = ${dominio} LIMIT 1`,
    );
    return this.mapearColegioPublico(filas[0]);
  }

  /** Normaliza una fila cruda de `colegios_publico` al contrato interno. */
  private mapearColegioPublico(
    fila: Record<string, unknown> | undefined,
  ): ColegioPublicoRow | null {
    if (fila === undefined) return null;
    const logo = fila['logo_url'];
    const color = fila['primary_color'];
    const dominio = fila['dominio_email'];
    return {
      id: String(fila['id']),
      nombre: String(fila['nombre']),
      codigoDane: String(fila['codigo_dane']),
      subdominio: String(fila['subdominio']),
      dominioEmail: dominio === null || dominio === undefined ? null : String(dominio),
      logoUrl: logo === null || logo === undefined ? null : String(logo),
      primaryColor: color === null || color === undefined ? null : String(color),
      estado: String(fila['estado']),
      municipio: String(fila['municipio']),
      departamento: String(fila['departamento']),
    };
  }

  /** Sesión por hash de token (validación de la cookie). */
  async findSesionAuth(tokenHash: string): Promise<SesionAuthRow | null> {
    const filas = await this.db.execute(
      sql`SELECT id, colegio_id, usuario_id, plataforma_usuario_id, expira_en, revocada_en, ultima_actividad_en
          FROM sesiones_auth WHERE token_hash = ${tokenHash} LIMIT 1`,
    );
    const fila = filas[0];
    if (fila === undefined) return null;
    return {
      id: String(fila['id']),
      colegioId: nullableString(fila['colegio_id']),
      usuarioId: nullableString(fila['usuario_id']),
      plataformaUsuarioId: nullableString(fila['plataforma_usuario_id']),
      expiraEn: aFecha(fila['expira_en']),
      revocadaEn: nullableFecha(fila['revocada_en']),
      ultimaActividadEn: aFecha(fila['ultima_actividad_en']),
    };
  }

  // ------------------------------------------------------------------
  // Usuarios de colegio (tenant)
  // ------------------------------------------------------------------

  /** Usuario por nombre de usuario dentro del colegio (normalizado a minúsculas). */
  async findUsuarioPorUsuario(ctx: TenantContext, usuario: string): Promise<UsuarioAuthRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(USUARIO_COLUMNS)
        .from(usuarios)
        .where(
          and(eq(usuarios.colegioId, ctx.colegioId), eq(usuarios.usuario, usuario.toLowerCase())),
        )
        .limit(1);
      return filas[0] ?? null;
    });
  }

  /** Usuario por id dentro del colegio. */
  async findUsuarioPorId(ctx: TenantContext, usuarioId: string): Promise<UsuarioAuthRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(USUARIO_COLUMNS)
        .from(usuarios)
        .where(and(eq(usuarios.colegioId, ctx.colegioId), eq(usuarios.id, usuarioId)))
        .limit(1);
      return filas[0] ?? null;
    });
  }

  /** Colegio de la sesión (policy self: id = app.current_tenant). */
  async findColegioPorId(ctx: TenantContext): Promise<ColegioAuthRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(COLEGIO_COLUMNS)
        .from(colegios)
        .where(eq(colegios.id, ctx.colegioId))
        .limit(1);
      return filas[0] ?? null;
    });
  }

  /** Códigos de permiso asignados al usuario (vacío para esAdmin — no aplica). */
  async findPermisosDeUsuario(ctx: TenantContext, usuarioId: string): Promise<string[]> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select({ codigo: permisos.codigo })
        .from(usuariosPermisos)
        .innerJoin(permisos, eq(usuariosPermisos.permisoId, permisos.id))
        .where(
          and(
            eq(usuariosPermisos.colegioId, ctx.colegioId),
            eq(usuariosPermisos.usuarioId, usuarioId),
          ),
        );
      return filas.map((f) => f.codigo);
    });
  }

  // ------------------------------------------------------------------
  // Escrituras de login / sesión
  // ------------------------------------------------------------------

  /** Suma un intento fallido (y bloquea si se alcanzó el máximo). */
  async registrarLoginFallido(
    ctx: TenantContext,
    usuarioId: string,
    intentos: number,
    bloqueadoHasta: Date | null,
  ): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(usuarios)
        .set({ intentosFallidos: intentos, bloqueadoHasta, updatedAt: new Date() })
        .where(and(eq(usuarios.colegioId, ctx.colegioId), eq(usuarios.id, usuarioId)));
    });
  }

  /** Login exitoso: resetea intentos y registra último acceso. */
  async registrarLoginExitoso(ctx: TenantContext, usuarioId: string): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(usuarios)
        .set({
          intentosFallidos: 0,
          bloqueadoHasta: null,
          ultimoAcceso: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(usuarios.colegioId, ctx.colegioId), eq(usuarios.id, usuarioId)));
    });
  }

  /** Crea la sesión de un usuario de colegio. */
  async crearSesionUsuario(
    ctx: TenantContext,
    data: {
      usuarioId: string;
      tokenHash: string;
      expiraEn: Date;
      ip?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx.insert(sesiones).values({
        colegioId: ctx.colegioId,
        usuarioId: data.usuarioId,
        tokenHash: data.tokenHash,
        expiraEn: data.expiraEn,
        ipOrigen: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      });
    });
  }

  /** Marca actividad reciente (con throttle — lo decide el llamador). */
  async touchSesion(ctx: TenantContext, sesionId: string): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(sesiones)
        .set({ ultimaActividadEn: new Date() })
        .where(and(eq(sesiones.id, sesionId), eq(sesiones.colegioId, ctx.colegioId)));
    });
  }

  /** Revoca una sesión de colegio (logout). */
  async revocarSesionColegio(ctx: TenantContext, sesionId: string): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(sesiones)
        .set({ revocadaEn: new Date() })
        .where(and(eq(sesiones.id, sesionId), eq(sesiones.colegioId, ctx.colegioId)));
    });
  }

  /** Revoca todas las sesiones activas de un usuario (excepto la actual). */
  async revocarSesionesDeUsuario(
    ctx: TenantContext,
    usuarioId: string,
    exceptoSesionId?: string,
  ): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(sesiones)
        .set({ revocadaEn: new Date() })
        .where(
          and(
            eq(sesiones.colegioId, ctx.colegioId),
            eq(sesiones.usuarioId, usuarioId),
            isNull(sesiones.revocadaEn),
            ...(exceptoSesionId !== undefined ? [ne(sesiones.id, exceptoSesionId)] : []),
          ),
        );
    });
  }

  /** Actualiza la contraseña y limpia el flag de primer login. */
  async actualizarPassword(
    ctx: TenantContext,
    usuarioId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(usuarios)
        .set({ passwordHash, debeCambiarPassword: false, updatedAt: new Date() })
        .where(and(eq(usuarios.colegioId, ctx.colegioId), eq(usuarios.id, usuarioId)));
    });
  }

  // ------------------------------------------------------------------
  // Nivel plataforma (cross-tenant — contexto con isPlatformAdmin)
  // ------------------------------------------------------------------

  async findPlataformaUsuarioPorEmail(
    ctx: TenantContext,
    email: string,
  ): Promise<PlataformaUsuarioRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(PLATAFORMA_COLUMNS)
        .from(plataformaUsuarios)
        .where(eq(plataformaUsuarios.email, email.toLowerCase()))
        .limit(1);
      return filas[0] ?? null;
    });
  }

  async findPlataformaUsuarioPorId(
    ctx: TenantContext,
    plataformaUsuarioId: string,
  ): Promise<PlataformaUsuarioRow | null> {
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select(PLATAFORMA_COLUMNS)
        .from(plataformaUsuarios)
        .where(eq(plataformaUsuarios.id, plataformaUsuarioId))
        .limit(1);
      return filas[0] ?? null;
    });
  }

  /** Crea la sesión de un usuario de plataforma (colegio_id NULL). */
  async crearSesionPlataforma(
    ctx: TenantContext,
    data: {
      plataformaUsuarioId: string;
      tokenHash: string;
      expiraEn: Date;
      ip?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx.insert(sesiones).values({
        colegioId: null,
        plataformaUsuarioId: data.plataformaUsuarioId,
        tokenHash: data.tokenHash,
        expiraEn: data.expiraEn,
        ipOrigen: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      });
    });
  }

  /** Revoca una sesión de plataforma (logout). */
  async revocarSesionPlataforma(ctx: TenantContext, sesionId: string): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(sesiones)
        .set({ revocadaEn: new Date() })
        .where(and(eq(sesiones.id, sesionId), isNull(sesiones.colegioId)));
    });
  }
}

/** Convierte un valor `unknown` de la fila cruda de la vista a string|null. */
function nullableString(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

/** Convierte un valor `unknown` de la fila cruda a Date. */
function aFecha(valor: unknown): Date {
  return valor instanceof Date ? valor : new Date(String(valor));
}

/** Convierte un valor `unknown` de la fila cruda a Date|null. */
function nullableFecha(valor: unknown): Date | null {
  return valor === null || valor === undefined ? null : aFecha(valor);
}
