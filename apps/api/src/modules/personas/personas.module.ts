/**
 * PersonasModule — pestañas Empleados · Estudiantes · Acudientes.
 * Los roles viven en RolesModule; los listados son de solo lectura.
 */
import { Module } from '@nestjs/common';
import { PersonasController } from './personas.controller';
import { PersonasRepository } from './personas.repository';
import { PersonasService } from './personas.service';

@Module({
  controllers: [PersonasController],
  providers: [PersonasService, PersonasRepository],
})
export class PersonasModule {}