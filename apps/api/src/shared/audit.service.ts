/**
 * AuditService — escritura de `audit_log` (obligatoria: Ley 1581, AGENTS.md §1.2).
 * Una fila por acción sensible (login, cambios, accesos denegados...).
 *
 * La auditoría NUNCA debe tumbar la operación principal: si falla la escritura
 * del log, se registra el error y se continúa (try/catch deliberado).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { auditLog, withTenant, type Database, type TenantContext } from '@eduplatform/database';
import { DATABASE } from './database.module';

export type AuditAction =
  | 'READ'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PERMISSION_DENIED';

export interface AuditEntry {
  accion: AuditAction;
  /** Entidad afectada ('auth', 'usuarios', 'calificaciones'...). */
  entidad: string;
  entidadId?: string;
  /** Colegio del evento. Sin colegio = acción de plataforma (cross-tenant). */
  colegioId?: string;
  usuarioId?: string;
  metadata?: {
    ip?: string;
    userAgent?: string;
    motivo?: string;
    cambios?: Record<string, { antes: unknown; despues: unknown }>;
  };
}

/** UUID dummy para operaciones de plataforma (el valor no filtra nada: la
 *  política RLS que aplica es la de platform_admin cuando no hay colegio). */
const SIN_COLEGIO = '00000000-0000-0000-0000-000000000000';

/** Tope de tamaño de la metadata (un UA o un diff gigante infla el WAL). */
const MAX_USER_AGENT = 256;
const MAX_METADATA_JSON = 2048;

/**
 * Recorta la metadata antes de escribirla (S11 del informe): el `userAgent` lo
 * manda el cliente y los diffs de permisos pueden ser enormes.
 */
function metadataAcotada(
  metadata: NonNullable<AuditEntry['metadata']> | undefined,
): NonNullable<AuditEntry['metadata']> | null {
  if (metadata === undefined) return null;
  const acotada: NonNullable<AuditEntry['metadata']> = { ...metadata };
  if (acotada.userAgent !== undefined && acotada.userAgent.length > MAX_USER_AGENT) {
    acotada.userAgent = `${acotada.userAgent.slice(0, MAX_USER_AGENT)}…`;
  }
  if (JSON.stringify(acotada).length > MAX_METADATA_JSON) {
    // El diff no cabe: se conserva el motivo y se marca el recorte.
    return { ...acotada, cambios: { truncado: { antes: null, despues: true } } };
  }
  return acotada;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async registrar(entry: AuditEntry): Promise<void> {
    try {
      const ctx: TenantContext = {
        colegioId: entry.colegioId ?? SIN_COLEGIO,
        isPlatformAdmin: entry.colegioId === undefined,
        ...(entry.usuarioId !== undefined ? { userId: entry.usuarioId } : {}),
      };
      await withTenant(this.db, ctx, async (tx) => {
        await tx.insert(auditLog).values({
          colegioId: entry.colegioId ?? null,
          usuarioId: entry.usuarioId ?? null,
          accion: entry.accion,
          entidad: entry.entidad,
          entidadId: entry.entidadId ?? null,
          metadata: metadataAcotada(entry.metadata),
        });
      });
    } catch (err) {
      this.logger.error(
        `No se pudo escribir audit_log (${entry.accion} ${entry.entidad}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}