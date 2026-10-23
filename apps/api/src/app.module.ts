/**
 * Módulo raíz de la API. Cada módulo de dominio se registra aquí.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PersonasModule } from './modules/personas/personas.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { DatabaseModule } from './shared/database.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    DatabaseModule,
    SharedModule,
    AuthModule,
    UsuariosModule,
    RolesModule,
    PersonasModule,
    OnboardingModule,
    HealthModule,
  ],
})
export class AppModule {}
