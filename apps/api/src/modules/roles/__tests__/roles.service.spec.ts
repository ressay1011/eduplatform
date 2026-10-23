/**
 * RolesService — pruebas unitarias con un repositorio falso.
 * Cubren las reglas de negocio que NO dependen de Postgres: nombre duplicado,
 * roles predeterminados, roles en uso y duplicado con nombre libre.
 */
import { describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@eduplatform/database';
import type { RolListado } from '@eduplatform/types';
import { RolesService, type ActorRoles } from '../roles.service';
import type { RolesRepository } from '../roles.repository';

const ACTOR: ActorRoles = { colegioId: 'c1', usuarioId: 'u1', esAdmin: true };

function rol(parcial: Partial<RolListado> = {}): RolListado {
  return {
    id: 'r1',
    nombre: 'Docente',
    descripcion: null,
    tipoPersona: 'EMPLEADO',
    esPredeterminado: true,
    activo: true,
    permisos: ['calificaciones.editar'],
    personas: 0,
    ...parcial,
  };
}

/** Repositorio falso: solo lo que el service usa. */
function repositorioFalso(roles: RolListado[]) {
  const estado = { roles: [...roles] };
  const repo = {
    listar: vi.fn(async (_ctx: TenantContext) => estado.roles),
    findPorId: vi.fn(
      async (_ctx: TenantContext, id: string) => estado.roles.find((r) => r.id === id) ?? null,
    ),
    existeNombre: vi.fn(async (_ctx: TenantContext, nombre: string, exceptoId?: string) =>
      estado.roles.some(
        (r) => r.nombre.toLowerCase() === nombre.toLowerCase() && r.id !== exceptoId,
      ),
    ),
    crear: vi.fn(async (_ctx: TenantContext, datos: { nombre: string }) => {
      const nuevo = rol({
        id: `r${estado.roles.length + 1}`,
        nombre: datos.nombre,
        esPredeterminado: false,
      });
      estado.roles.push(nuevo);
      return nuevo;
    }),
    actualizar: vi.fn(async () => estado.roles[0] ?? null),
    eliminar: vi.fn(async () => true),
    reemplazarPermisos: vi.fn(
      async (_ctx: TenantContext, _id: string, codigos: readonly string[]) => [...codigos],
    ),
    sincronizarProyeccion: vi.fn(async () => undefined),
    sedes: vi.fn(async () => []),
  };
  return { repo, estado };
}

function servicio(roles: RolListado[]) {
  const { repo, estado } = repositorioFalso(roles);
  const audit = { registrar: vi.fn(async () => undefined) };
  const service = new RolesService(
    repo as unknown as RolesRepository,
    audit as unknown as ConstructorParameters<typeof RolesService>[1],
  );
  return { service, repo, estado, audit };
}

describe('RolesService', () => {
  it('no permite dos roles con el mismo nombre', async () => {
    const { service } = servicio([rol()]);
    await expect(
      service.crear(ACTOR, { nombre: 'docente', tipoPersona: 'EMPLEADO', permisos: [] }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('crea el rol y audita el alta', async () => {
    const { service, audit } = servicio([rol()]);
    const creado = await service.crear(ACTOR, {
      nombre: 'Bibliotecario',
      tipoPersona: 'EMPLEADO',
      permisos: ['usuarios.ver'],
    });
    expect(creado.nombre).toBe('Bibliotecario');
    expect(audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'CREATE', entidad: 'roles' }),
    );
  });

  it('rechaza permisos que no existen en el catálogo', async () => {
    const { service, repo } = servicio([rol()]);
    repo.reemplazarPermisos.mockResolvedValueOnce([]);
    await expect(
      service.crear(ACTOR, { nombre: 'Raro', tipoPersona: 'EMPLEADO', permisos: ['no.existe'] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('los roles predeterminados no se eliminan', async () => {
    const { service } = servicio([rol({ esPredeterminado: true })]);
    await expect(service.eliminar(ACTOR, 'r1')).rejects.toMatchObject({ status: 400 });
  });

  it('un rol en uso no se elimina (409 con el conteo)', async () => {
    const { service } = servicio([rol({ esPredeterminado: false, personas: 3 })]);
    await expect(service.eliminar(ACTOR, 'r1')).rejects.toMatchObject({ status: 409 });
  });

  it('duplicar genera un nombre libre cuando ya existe la copia', async () => {
    const { service, estado } = servicio([
      rol(),
      rol({ id: 'r2', nombre: 'Copia de Docente', esPredeterminado: false }),
    ]);
    const copia = await service.duplicar(ACTOR, 'r1');
    expect(copia.nombre).toBe('Copia de Docente (2)');
    expect(estado.roles).toHaveLength(3);
  });
});
