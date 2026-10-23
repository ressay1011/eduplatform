/**
 * ContextoCacheService — caché en memoria del contexto público del colegio
 * (branding del login). Evita consultar la BD en cada carga del login.
 *
 * INVALIDACIÓN EXPLÍCITA: el módulo de colegios llamará a `invalidar()` al
 * editar nombre/color/logo/estado (mismo patrón que usará el caché de
 * permisos: lo que se escribe se invalida en el momento, sin esperar TTL).
 * El TTL es solo una red de seguridad.
 */
import { Injectable } from '@nestjs/common';
import type { ContextoPublicoConSede } from './auth.types';

interface Entrada {
  data: ContextoPublicoConSede;
  expiraEn: number;
}

@Injectable()
export class ContextoCacheService {
  /** Red de seguridad: si algo olvidó invalidar, se refresca en 10 minutos. */
  private static readonly TTL_MS = 10 * 60 * 1000;

  private readonly cache = new Map<string, Entrada>();

  /** `clave` = `dominio:<correo>` o `subdominio:<slug>` según la vía. */
  obtener(clave: string): ContextoPublicoConSede | null {
    const entrada = this.cache.get(clave);
    if (entrada === undefined) return null;
    if (entrada.expiraEn <= Date.now()) {
      this.cache.delete(clave);
      return null;
    }
    return entrada.data;
  }

  guardar(clave: string, data: ContextoPublicoConSede): void {
    this.cache.set(clave, { data, expiraEn: Date.now() + ContextoCacheService.TTL_MS });
  }

  /** Invalida el contexto de UN colegio (llamar al editar el colegio). */
  invalidar(clave: string): void {
    this.cache.delete(clave);
  }

  /** Limpia todo el caché (tests / operaciones masivas). */
  limpiar(): void {
    this.cache.clear();
  }
}