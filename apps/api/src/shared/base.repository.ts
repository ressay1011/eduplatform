/**
 * BaseRepository — patrón obligatorio de acceso a datos (AGENTS.md §1.6).
 * Los repositorios extienden esta clase; TODA query tenant-scoped se ejecuta
 * con `withTenant` (SET LOCAL app.current_tenant + filtro explícito por
 * colegio_id como defensa en profundidad). Los repositorios NO lanzan
 * HttpException: devuelven null/valores y el service decide el status.
 */
import { Inject } from '@nestjs/common';
import { withTenant, type Database, type TenantContext, type Tx } from '@eduplatform/database';
import { DATABASE } from './database.module';

export abstract class BaseRepository {
  constructor(@Inject(DATABASE) protected readonly db: Database) {}

  /** Ejecuta `fn` dentro de una transacción con el tenant activo. */
  protected withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withTenant(this.db, ctx, fn);
  }
}
