'use client';

/**
 * Hooks de Usuarios (TanStack Query): listado con búsqueda, catálogo de
 * permisos y mutaciones que invalidan la caché al escribir (mismo criterio
 * que el resto de la app: lo que se edita se refresca ya, no por TTL).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActualizarUsuarioRequest,
  CrearUsuarioRequest,
  ListaUsuarios,
  PasswordRestablecida,
  PermisoCatalogoItem,
  UsuarioCreado,
  UsuarioListado,
} from '@eduplatform/types';
import {
  actualizarUsuario,
  catalogoPermisos,
  crearUsuario,
  establecerPermisos,
  listarUsuarios,
  obtenerUsuario,
  resetearPassword,
} from '@/lib/api';

/** Prefijo de caché del módulo (invalidar ['usuarios'] refresca todo). */
export const USUARIOS_KEY = ['usuarios'] as const;

export function useUsuarios(q: string, estado: 'todos' | 'activo' | 'inactivo', habilitado = true) {
  return useQuery<ListaUsuarios>({
    queryKey: [...USUARIOS_KEY, 'lista', q, estado],
    queryFn: () => listarUsuarios({ q, estado, limit: 100 }),
    staleTime: 30_000,
    enabled: habilitado,
  });
}

export function useCatalogoPermisos() {
  return useQuery<PermisoCatalogoItem[]>({
    queryKey: [...USUARIOS_KEY, 'permisos'],
    queryFn: catalogoPermisos,
    staleTime: 10 * 60_000,
  });
}

export function useUsuario(id: string) {
  return useQuery<UsuarioListado>({
    queryKey: [...USUARIOS_KEY, 'detalle', id],
    queryFn: () => obtenerUsuario(id),
    enabled: id !== '',
    retry: false,
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  // R8 del informe: invalidar el prefijo ['usuarios'] refresca también el
  // catálogo (staleTime 10 min) sin necesidad. Se invalida la lista y el
  // detalle, que es lo que cambia al escribir.
  return qc.invalidateQueries({ queryKey: [...USUARIOS_KEY, 'lista'] });
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation<UsuarioCreado, Error, CrearUsuarioRequest>({
    mutationFn: crearUsuario,
    onSuccess: () => invalidar(qc),
  });
}

export function useActualizarUsuario(id: string) {
  const qc = useQueryClient();
  return useMutation<UsuarioListado, Error, ActualizarUsuarioRequest>({
    mutationFn: (dto) => actualizarUsuario(id, dto),
    onSuccess: () => invalidar(qc),
  });
}

export function useEstablecerPermisos(id: string) {
  const qc = useQueryClient();
  return useMutation<UsuarioListado, Error, string[]>({
    mutationFn: (permisos) => establecerPermisos(id, permisos),
    onSuccess: () => invalidar(qc),
  });
}

export function useResetearPassword(id: string) {
  const qc = useQueryClient();
  return useMutation<PasswordRestablecida, Error, void>({
    mutationFn: () => resetearPassword(id),
    onSuccess: () => invalidar(qc),
  });
}
