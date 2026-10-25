/**
 * MatriculasModule — matrícula de estudiantes en cursos del año lectivo.
 * La auditoría vive en SharedModule (global); el repositorio usa withTenant.
 */
import { Module } from '@nestjs/common';
import { MatriculasController } from './matriculas.controller';
import { MatriculasRepository } from './matriculas.repository';
import { MatriculasService } from './matriculas.service';

@Module({
  controllers: [MatriculasController],
  providers: [MatriculasService, MatriculasRepository],
})
export class MatriculasModule {}
