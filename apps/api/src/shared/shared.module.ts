/**
 * SharedModule — servicios transversales disponibles en TODA la app (@Global).
 * Hoy: AuditService. (DATABASE se provee en DatabaseModule.)
 */
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class SharedModule {}