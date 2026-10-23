'use client';

/**
 * Hooks del módulo Personas (TanStack Query).
 * La invalidación es selectiva (R8 del informe): roles y listados se refrescan
 * por separado; tocar un rol invalida solo roles y el listado de empleados.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActualizarRolRequest,
  CrearRolRequest,
  ListaPersonas,
  ListaRoles,
  PersonaAcudiente,
  PersonaEmpleado,
  PersonaEstudiante,
  RolListado,
} from '@eduplatform/types';
import {
  actualizarRol,
  crearRol,
  duplicarRol,
  eliminarRol,
  listarAcudientes,
  listarEmpleados,
  listarEstudiantes,
  listarRoles,
  obtenerSedes,
} from '@/lib/api';

export const ROLES_KEY = ['roles'] as const;
export const PERSONAS_KEY = ['personas'] as const;

export function useRoles(habilitado = true) {
  return useQuery<ListaRoles>({
    queryKey: [...ROLES_KEY, 'lista'],
    queryFn: listarRoles,
    staleTime: 60_000,
    enabled: habilitado,
  });
}

export function useSedes(habilitado = true) {
  return useQuery<{ id: string; nombre: string }[]>({
    queryKey: [...PERSONAS_KEY, 'sedes'],
    queryFn: obtenerSedes,
    staleTime: 5 * 60_000,
    enabled: habilitado,
  });
}

/** Un listado por pestaña; cada uno tiene su propia clave de caché. */
export function useEmpleados(q: string, habilitado = true) {
  return useQuery<ListaPersonas<PersonaEmpleado>>({
    queryKey: [...PERSONAS_KEY, 'empleados', q],
    queryFn: () => listarEmpleados({ q, limit: 100 }),
    staleTime: 30_000,
    enabled: habilitado,
  });
}

export function useEstudiantes(q: string, habilitado = true) {
  return useQuery<ListaPersonas<PersonaEstudiante>>({
    queryKey: [...PERSONAS_KEY, 'estudiantes', q],
    queryFn: () => listarEstudiantes({ q, limit: 100 }),
    staleTime: 30_000,
    enabled: habilitado,
  });
}

export function useAcudientes(q: string, habilitado = true) {
  return useQuery<ListaPersonas<PersonaAcudiente>>({
    queryKey: [...PERSONAS_KEY, 'acudientes', q],
    queryFn: () => listarAcudientes({ q, limit: 100 }),
    staleTime: 30_000,
    enabled: habilitado,
  });
}

function invalidarRoles(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ROLES_KEY }),
    qc.invalidateQueries({ queryKey: [...PERSONAS_KEY, 'empleados'] }),
  ]).then(() => undefined);
}

export function useCrearRol() {
  const qc = useQueryClient();
  return useMutation<RolListado, Error, CrearRolRequest>({
    mutationFn: crearRol,
    onSuccess: () => invalidarRoles(qc),
  });
}

export function useActualizarRol(id: string) {
  const qc = useQueryClient();
  return useMutation<RolListado, Error, ActualizarRolRequest>({
    mutationFn: (dto) => actualizarRol(id, dto),
    onSuccess: () => invalidarRoles(qc),
  });
}

export function useDuplicarRol() {
  const qc = useQueryClient();
  return useMutation<RolListado, Error, string>({
    mutationFn: duplicarRol,
    onSuccess: () => invalidarRoles(qc),
  });
}

export function useEliminarRol() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: eliminarRol,
    onSuccess: () => invalidarRoles(qc),
  });
}