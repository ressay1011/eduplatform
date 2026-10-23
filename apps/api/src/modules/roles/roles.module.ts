/**
 * RolesModule — roles por colegio del módulo Personas.
 * `AuditService` viene del SharedModule global; no requiere imports extra.
 */
import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService, RolesRepository],
  exports: [RolesService, RolesRepository],
})
export class RolesModule {}