/**
 * UsuariosModule — personal del colegio (crear cuentas, permisos, reset de
 * contraseña). Importa AuthModule por PasswordService (hash bcrypt).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [AuthModule, RolesModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosRepository],
})
export class UsuariosModule {}