/**
 * OnboardingModule — wizard de configuración inicial del colegio.
 * `AuditService` viene del SharedModule global.
 */
import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingRepository],
  exports: [OnboardingService],
})
export class OnboardingModule {}
