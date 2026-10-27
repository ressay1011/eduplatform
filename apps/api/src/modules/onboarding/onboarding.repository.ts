/**
 * OnboardingRepository — persistencia del wizard de configuración inicial.
 *
 * Todo tenant-scoped va con `withTenant` (RLS + filtro por colegio_id). Las
 * validaciones de negocio viven en el service; aquí solo se lee/escribe.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import {
  aniosLectivos,
  colegios,
  estudiantes,
  grados,
  grupos,
  matriculas,
  periodos,
  roles,
  sedes,
  usuarios,
} from '@eduplatform/database';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Jornada, PeriodoOnboardingRequest } from '@eduplatform/types';
import { BaseRepository } from '../../shared/base.repository';

/** Datos del paso 1 ya validados. */
export interface DatosColegio {
  nombre: string;
  nit?: string | undefined;
  codigoDane: string;
  subdominio: string;
  /**
   * Dominio del correo del admin que configura el colegio. NO se escribe como
   * actualización: solo rellena `dominio_email` cuando todavía es NULL (colegio
   * recién creado). El dominio es la llave del login y cambiarlo por el wizard
   * dejaba a todos los usuarios fuera (ADR-006).
   */
  dominioAdmin: string | null;
  municipio: string;
  departamento: string;
  direccion?: string | undefined;
  telefono?: string | undefined;
  email: string;
  calendario: 'A' | 'B';
  anioLectivo: number;
  periodos: PeriodoOnboardingRequest[];
}

/** Datos del paso 2 ya validados. */
export interface DatosSede {
  id?: string | undefined;
  nombre: string;
  codigoDaneSede?: string | undefined;
  direccion?: string | undefined;
  jornadas: Jornada[];
}

/** Datos del paso 3 ya validados. */
export interface DatosEstructura {
  sedeId: string;
  jornada: Jornada;
  grados: number[];
  letras: string[];
}

/** Foto completa del colegio para el wizard y el checklist. */
export interface FotoOnboarding {
  colegio: {
    id: string;
    nombre: string;
    nit: string | null;
    codigoDane: string;
    subdominio: string;
    dominioEmail: string | null;
    municipio: string;
    departamento: string;
    direccion: string | null;
    telefono: string | null;
    email: string;
    calendario: 'A' | 'B';
    onboardingPaso: number;
    onboardingCompletadoEn: Date | null;
  } | null;
  sedes: {
    id: string;
    nombre: string;
    codigoDaneSede: string | null;
    direccion: string | null;
    jornadas: Jornada[];
  }[];
  anio: { id: string; anio: number; fechaInicio: string; fechaFin: string } | null;
  periodos: { numero: number; nombre: string; fechaInicio: string; fechaFin: string }[];
  conteos: {
    grados: number;
    cursos: number;
    personal: number;
    estudiantes: number;
    matriculados: number;
    roles: number;
  };
}

const COLEGIO_COLUMNS = {
  id: colegios.id,
  nombre: colegios.nombre,
  nit: colegios.nit,
  codigoDane: colegios.codigoDane,
  subdominio: colegios.subdominio,
  dominioEmail: colegios.dominioEmail,
  municipio: colegios.municipio,
  departamento: colegios.departamento,
  direccion: colegios.direccion,
  telefono: colegios.telefono,
  email: colegios.email,
  calendario: colegios.calendario,
  onboardingPaso: colegios.onboardingPaso,
  onboardingCompletadoEn: colegios.onboardingCompletadoEn,
} as const;

@Injectable()
export class OnboardingRepository extends BaseRepository {
  /** Todo lo que necesita el wizard en una sola lectura. */
  async foto(ctx: TenantContext): Promise<FotoOnboarding> {
    return this.withTenant(ctx, async (tx) => {
      const [colegio] = await tx
        .select(COLEGIO_COLUMNS)
        .from(colegios)
        .where(eq(colegios.id, ctx.colegioId))
        .limit(1);

      const filasSedes = await tx
        .select({
          id: sedes.id,
          nombre: sedes.nombre,
          codigoDaneSede: sedes.codigoDaneSede,
          direccion: sedes.direccion,
          jornadas: sedes.jornadas,
        })
        .from(sedes)
        .where(and(eq(sedes.colegioId, ctx.colegioId), isNull(sedes.deletedAt)))
        .orderBy(asc(sedes.createdAt));

      const [anio] = await tx
        .select({
          id: aniosLectivos.id,
          anio: aniosLectivos.anio,
          fechaInicio: aniosLectivos.fechaInicio,
          fechaFin: aniosLectivos.fechaFin,
        })
        .from(aniosLectivos)
        .where(eq(aniosLectivos.colegioId, ctx.colegioId))
        .orderBy(desc(aniosLectivos.anio))
        .limit(1);

      const filasPeriodos =
        anio === undefined
          ? []
          : await tx
              .select({
                numero: periodos.numero,
                nombre: periodos.nombre,
                fechaInicio: periodos.fechaInicio,
                fechaFin: periodos.fechaFin,
              })
              .from(periodos)
              .where(eq(periodos.anioLectivoId, anio.id))
              .orderBy(asc(periodos.numero));

      const [g] = await tx
        .select({ n: count() })
        .from(grados)
        .where(eq(grados.colegioId, ctx.colegioId));
      const [c] = await tx
        .select({ n: count() })
        .from(grupos)
        .where(eq(grupos.colegioId, ctx.colegioId));
      const [p] = await tx
        .select({ n: count() })
        .from(usuarios)
        .where(and(eq(usuarios.colegioId, ctx.colegioId), isNull(usuarios.deletedAt)));
      const [e] = await tx
        .select({ n: count() })
        .from(estudiantes)
        .where(eq(estudiantes.colegioId, ctx.colegioId));
      const [m] = await tx
        .select({ n: count() })
        .from(matriculas)
        .where(and(eq(matriculas.colegioId, ctx.colegioId), eq(matriculas.estado, 'MATRICULADO')));
      const [r] = await tx
        .select({ n: count() })
        .from(roles)
        .where(eq(roles.colegioId, ctx.colegioId));

      return {
        colegio: colegio ?? null,
        sedes: filasSedes,
        anio: anio ?? null,
        periodos: filasPeriodos,
        conteos: {
          grados: Number(g?.n ?? 0),
          cursos: Number(c?.n ?? 0),
          personal: Number(p?.n ?? 0),
          estudiantes: Number(e?.n ?? 0),
          matriculados: Number(m?.n ?? 0),
          roles: Number(r?.n ?? 0),
        },
      };
    });
  }

  /** Claves públicas de caché del colegio (subdominio y dominio de login). */
  async contextoPublico(
    ctx: TenantContext,
  ): Promise<{ subdominio: string; dominioEmail: string | null } | null> {
    return this.withTenant(ctx, async (tx) => {
      const [fila] = await tx
        .select({ subdominio: colegios.subdominio, dominioEmail: colegios.dominioEmail })
        .from(colegios)
        .where(eq(colegios.id, ctx.colegioId))
        .limit(1);
      return fila ?? null;
    });
  }

  /** Paso 1: identidad + año lectivo + períodos (reemplaza los del año). */
  async guardarColegio(ctx: TenantContext, datos: DatosColegio): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(colegios)
        .set({
          nombre: datos.nombre,
          nit: datos.nit ?? null,
          codigoDane: datos.codigoDane,
          subdominio: datos.subdominio,
          municipio: datos.municipio,
          departamento: datos.departamento,
          direccion: datos.direccion ?? null,
          telefono: datos.telefono ?? null,
          email: datos.email,
          calendario: datos.calendario,
          onboardingPaso: sql`greatest(${colegios.onboardingPaso}, 2)`,
          updatedAt: new Date(),
        })
        .where(eq(colegios.id, ctx.colegioId));

      // El dominio de login NUNCA se sobrescribe desde el wizard: solo se fija
      // la primera vez (colegio sin dominio), con el dominio del correo del
      // admin, para que su propio acceso siga funcionando.
      if (datos.dominioAdmin !== null) {
        await tx
          .update(colegios)
          .set({ dominioEmail: datos.dominioAdmin })
          .where(and(eq(colegios.id, ctx.colegioId), isNull(colegios.dominioEmail)));
      }

      const fechas = datos.periodos.map((p) => p.fechaInicio).sort((a, b) => a.localeCompare(b));
      const inicio = fechas[0] ?? `${datos.anioLectivo}-02-01`;
      const fin =
        datos.periodos
          .map((p) => p.fechaFin)
          .sort((a, b) => a.localeCompare(b))
          .at(-1) ?? `${datos.anioLectivo}-11-30`;

      const [existente] = await tx
        .select({ id: aniosLectivos.id })
        .from(aniosLectivos)
        .where(
          and(
            eq(aniosLectivos.colegioId, ctx.colegioId),
            eq(aniosLectivos.anio, datos.anioLectivo),
          ),
        )
        .limit(1);

      let anioId: string;
      if (existente === undefined) {
        const [creado] = await tx
          .insert(aniosLectivos)
          .values({
            colegioId: ctx.colegioId,
            anio: datos.anioLectivo,
            fechaInicio: inicio,
            fechaFin: fin,
            estado: 'CONFIGURACION',
          })
          .returning({ id: aniosLectivos.id });
        anioId = creado!.id;
      } else {
        anioId = existente.id;
        await tx
          .update(aniosLectivos)
          .set({ fechaInicio: inicio, fechaFin: fin, updatedAt: new Date() })
          .where(eq(aniosLectivos.id, anioId));
      }

      await tx.delete(periodos).where(eq(periodos.anioLectivoId, anioId));
      await tx.insert(periodos).values(
        datos.periodos.map((p) => ({
          colegioId: ctx.colegioId,
          anioLectivoId: anioId,
          numero: p.numero,
          nombre: p.nombre,
          fechaInicio: p.fechaInicio,
          fechaFin: p.fechaFin,
          fechaAperturaNotas: p.fechaInicio,
          fechaCierreNotas: p.fechaFin,
        })),
      );
    });
  }

  /** Paso 2: crea o actualiza una sede con sus jornadas. */
  async guardarSede(ctx: TenantContext, datos: DatosSede): Promise<string | null> {
    return this.withTenant(ctx, async (tx) => {
      let sedeId: string | null;
      if (datos.id === undefined) {
        const [creada] = await tx
          .insert(sedes)
          .values({
            colegioId: ctx.colegioId,
            nombre: datos.nombre,
            codigoDaneSede: datos.codigoDaneSede ?? null,
            direccion: datos.direccion ?? null,
            jornadas: datos.jornadas,
          })
          .returning({ id: sedes.id });
        sedeId = creada?.id ?? null;
      } else {
        const [actualizada] = await tx
          .update(sedes)
          .set({
            nombre: datos.nombre,
            codigoDaneSede: datos.codigoDaneSede ?? null,
            direccion: datos.direccion ?? null,
            jornadas: datos.jornadas,
            updatedAt: new Date(),
          })
          .where(and(eq(sedes.id, datos.id), eq(sedes.colegioId, ctx.colegioId)))
          .returning({ id: sedes.id });
        sedeId = actualizada?.id ?? null;
      }

      if (sedeId !== null) {
        await tx
          .update(colegios)
          .set({ onboardingPaso: sql`greatest(${colegios.onboardingPaso}, 3)` })
          .where(eq(colegios.id, ctx.colegioId));
      }
      return sedeId;
    });
  }

  /** Sede con su año lectivo vigente (para validar el generador). */
  async sedeConAnio(
    ctx: TenantContext,
    sedeId: string,
  ): Promise<{ jornadas: Jornada[]; anioId: string | null } | null> {
    return this.withTenant(ctx, async (tx) => {
      const [sede] = await tx
        .select({ jornadas: sedes.jornadas })
        .from(sedes)
        .where(and(eq(sedes.id, sedeId), eq(sedes.colegioId, ctx.colegioId)))
        .limit(1);
      if (sede === undefined) return null;

      const [anio] = await tx
        .select({ id: aniosLectivos.id })
        .from(aniosLectivos)
        .where(eq(aniosLectivos.colegioId, ctx.colegioId))
        .orderBy(desc(aniosLectivos.anio))
        .limit(1);

      return { jornadas: sede.jornadas, anioId: anio?.id ?? null };
    });
  }

  /** Paso 3: asegura el catálogo de grados y genera los cursos. */
  async generarEstructura(
    ctx: TenantContext,
    datos: DatosEstructura,
    anioId: string,
  ): Promise<{ creados: number; grados: number }> {
    return this.withTenant(ctx, async (tx) => {
      const existentes = await tx
        .select({ id: grados.id, numero: grados.numero })
        .from(grados)
        .where(eq(grados.colegioId, ctx.colegioId));

      const porNumero = new Map(existentes.map((g) => [g.numero, g.id]));
      const faltantes = datos.grados.filter((n) => !porNumero.has(n));

      if (faltantes.length > 0) {
        const creados = await tx
          .insert(grados)
          .values(
            faltantes.map((numero) => ({
              colegioId: ctx.colegioId,
              numero,
              nombre: numero === 0 ? 'Transición' : `${numero}°`,
              nivel:
                numero === 0
                  ? ('PREESCOLAR' as const)
                  : numero <= 5
                    ? ('PRIMARIA' as const)
                    : ('BACHILLERATO' as const),
            })),
          )
          .returning({ id: grados.id, numero: grados.numero });
        for (const g of creados) porNumero.set(g.numero, g.id);
      }

      const valores = datos.grados.flatMap((numero) => {
        const gradoId = porNumero.get(numero);
        if (gradoId === undefined) return [];
        return datos.letras.map((letra) => ({
          colegioId: ctx.colegioId,
          sedeId: datos.sedeId,
          anioLectivoId: anioId,
          gradoId,
          letra,
          jornada: datos.jornada,
        }));
      });

      const insertados =
        valores.length === 0
          ? []
          : await tx
              .insert(grupos)
              .values(valores)
              .onConflictDoNothing()
              .returning({ id: grupos.id });

      await tx
        .update(colegios)
        .set({ onboardingPaso: sql`greatest(${colegios.onboardingPaso}, 4)` })
        .where(eq(colegios.id, ctx.colegioId));

      return { creados: insertados.length, grados: datos.grados.length };
    });
  }

  /** Mínimo para finalizar: una sede con jornada y al menos un curso. */
  async minimo(ctx: TenantContext): Promise<{ sedesConJornada: number; cursos: number }> {
    return this.withTenant(ctx, async (tx) => {
      const [s] = await tx
        .select({ n: count() })
        .from(sedes)
        .where(
          and(
            eq(sedes.colegioId, ctx.colegioId),
            isNull(sedes.deletedAt),
            sql`jsonb_array_length(${sedes.jornadas}) > 0`,
          ),
        );
      const [c] = await tx
        .select({ n: count() })
        .from(grupos)
        .where(eq(grupos.colegioId, ctx.colegioId));
      return { sedesConJornada: Number(s?.n ?? 0), cursos: Number(c?.n ?? 0) };
    });
  }

  /** Cierra el wizard (idempotente). */
  async finalizar(ctx: TenantContext): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(colegios)
        .set({ onboardingCompletadoEn: new Date(), onboardingPaso: 6, updatedAt: new Date() })
        .where(eq(colegios.id, ctx.colegioId));
    });
  }

  /** Guarda en qué paso quedó («Guardar y salir»). */
  async marcarPaso(ctx: TenantContext, paso: number): Promise<void> {
    await this.withTenant(ctx, async (tx) => {
      await tx
        .update(colegios)
        .set({ onboardingPaso: Math.min(6, Math.max(1, paso)) })
        .where(eq(colegios.id, ctx.colegioId));
    });
  }

  /** Roles del colegio (para el checklist de resumen). */
  async contarRoles(ctx: TenantContext): Promise<number> {
    return this.withTenant(ctx, async (tx) => {
      const [r] = await tx
        .select({ n: count() })
        .from(roles)
        .where(eq(roles.colegioId, ctx.colegioId));
      return Number(r?.n ?? 0);
    });
  }

  /** Sedes por id (para validar pertenencia antes de generar cursos). */
  async sedesPorIds(ctx: TenantContext, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    return this.withTenant(ctx, async (tx) => {
      const filas = await tx
        .select({ id: sedes.id })
        .from(sedes)
        .where(and(eq(sedes.colegioId, ctx.colegioId), inArray(sedes.id, ids)));
      return filas.map((f) => f.id);
    });
  }
}
