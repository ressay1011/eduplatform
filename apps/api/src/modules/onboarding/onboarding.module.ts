/**
 * OnboardingModule — wizard de configuración inicial del colegio.
 * `AuditService` viene del SharedModule global.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DaneService } from './dane.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

@Module({
  // AuthModule aporta `AuthService.invalidarContextoColegio` (ADR-005): el paso 1
  // cambia nombre/subdominio, que se pintan en el login, y no deben esperar el TTL.
  imports: [AuthModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingRepository, DaneService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
