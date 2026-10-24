/**
 * PersonasService — lecturas del módulo Personas.
 * Solo consultas: el alta/edición vive en Usuarios (empleados) y llegará para
 * estudiantes/acudientes con el módulo de matrículas.
 */
import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@eduplatform/database';
import type {
  ListaPersonas,
  ListarPersonasQuery,
  PersonaAcudiente,
  PersonaEmpleado,
  PersonaEstudiante,
} from '@eduplatform/types';
import { PersonasRepository } from './personas.repository';

export interface ActorPersonas {
  colegioId: string;
  usuarioId: string;
}

@Injectable()
export class PersonasService {
  constructor(private readonly repo: PersonasRepository) {}

  private contexto(actor: ActorPersonas): TenantContext {
    return { colegioId: actor.colegioId, isPlatformAdmin: false, userId: actor.usuarioId };
  }

  private normalizar(
    filtros: ListarPersonasQuery,
  ): ListarPersonasQuery & { page: number; limit: number } {
    return { ...filtros, page: filtros.page ?? 1, limit: filtros.limit ?? 20 };
  }

  empleados(
    actor: ActorPersonas,
    filtros: ListarPersonasQuery,
  ): Promise<ListaPersonas<PersonaEmpleado>> {
    return this.repo.empleados(this.contexto(actor), this.normalizar(filtros));
  }

  estudiantes(
    actor: ActorPersonas,
    filtros: ListarPersonasQuery,
  ): Promise<ListaPersonas<PersonaEstudiante>> {
    return this.repo.estudiantes(this.contexto(actor), this.normalizar(filtros));
  }

  acudientes(
    actor: ActorPersonas,
    filtros: ListarPersonasQuery,
  ): Promise<ListaPersonas<PersonaAcudiente>> {
    return this.repo.acudientes(this.contexto(actor), this.normalizar(filtros));
  }

  resumen(
    actor: ActorPersonas,
  ): Promise<{ empleados: number; estudiantes: number; acudientes: number }> {
    return this.repo.resumen(this.contexto(actor));
  }
}
