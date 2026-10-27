/**
 * DaneService — datos del establecimiento educativo en los datos abiertos del MEN.
 *
 * Con solo el código DANE de 12 dígitos se consulta el dataset
 * `cfw5-qzt5` (datos.gov.co, API Socrata/SoQL) y se devuelve una propuesta para
 * el paso 1 del onboarding: identidad, ubicación, contacto, calendario y tamaño.
 *
 * Reglas:
 *  - El resultado es una SUGERENCIA: el admin revisa y corrige antes de guardar.
 *  - El token (`DATOS_GOV_APP_TOKEN`) es opcional. Sin él la petición sale del
 *    pool por IP de Socrata (no hay cupo propio); con él, 1.000 req/hora.
 *  - Un 403 de datos.gov.co NO es «colegio no encontrado»: es un token inválido
 *    o revocado, un fallo de configuración que se registra como error.
 *  - Se cachea en memoria 6 h: el MEN publica estos datos una vez al año y el
 *    código se consulta desde el navegador del admin.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Calendario, ErrorCodes, type ColegioDane } from '@eduplatform/types';
import { env } from '../../config/env';
import { apiError } from '../../shared/api-error';

/** Dataset «ESTABLECIMIENTOS EDUCATIVOS» del MEN (Socrata). */
const URL_DATASET = 'https://www.datos.gov.co/resource/cfw5-qzt5.json';
const TTL_MS = 6 * 60 * 60 * 1000;
/** El admin espera delante del botón: mejor fallar rápido que colgar la UI. */
const TIMEOUT_MS = 8_000;
/** Tope de entradas en memoria (evita crecer sin límite con códigos inventados). */
const MAX_CACHE = 500;

/** Fila cruda de Socrata: todos los campos llegan como texto o ausentes. */
interface FilaEstablecimiento {
  a_o?: string;
  codigo_dane?: string;
  nombre_establecimiento?: string;
  municipio?: string;
  departamento?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  calendario?: string;
  sector?: string;
  caracter?: string;
  rector?: string;
  total_matricula?: string;
  cantidad_sedes?: string;
}

@Injectable()
export class DaneService {
  private readonly logger = new Logger(DaneService.name);
  private readonly cache = new Map<string, { datos: ColegioDane; expira: number }>();
  private avisoSinToken = false;

  /** Busca el establecimiento por código DANE (12 dígitos ya validados). */
  async buscar(codigo: string): Promise<ColegioDane> {
    const enCache = this.cache.get(codigo);
    if (enCache !== undefined && enCache.expira > Date.now()) return enCache.datos;

    const fila = await this.consultar(codigo);
    const datos = this.aColegio(codigo, fila);

    if (this.cache.size >= MAX_CACHE) this.cache.clear();
    this.cache.set(codigo, { datos, expira: Date.now() + TTL_MS });
    return datos;
  }

  /** Una sola petición a Socrata: la fila más reciente del código. */
  private async consultar(codigo: string): Promise<FilaEstablecimiento> {
    const url = new URL(URL_DATASET);
    url.searchParams.set('$where', `codigo_dane=${codigo}`);
    // `$order` por año: no clavamos el año 2025 en el código, así la consulta
    // sigue sirviendo cuando el MEN publique el reporte siguiente.
    url.searchParams.set('$order', 'a_o DESC');
    url.searchParams.set('$limit', '1');

    const cabeceras: Record<string, string> = { Accept: 'application/json' };
    if (env.DATOS_GOV_APP_TOKEN !== undefined) {
      cabeceras['X-App-Token'] = env.DATOS_GOV_APP_TOKEN;
    } else if (!this.avisoSinToken) {
      this.avisoSinToken = true;
      this.logger.warn(
        'DATOS_GOV_APP_TOKEN no está definido: la consulta por código DANE usa el cupo por IP de datos.gov.co.',
      );
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      this.logger.error(
        `datos.gov.co no respondió para el código ${codigo}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw apiError(
        ErrorCodes.INTERNAL_ERROR,
        502,
        'El servicio de datos del MEN no respondió. Intenta de nuevo en unos minutos.',
      );
    }

    // 403/401 = app token inválido o revocado. Es un fallo de configuración de
    // la plataforma, no del colegio consultado: se registra para diagnóstico.
    if (respuesta.status === 401 || respuesta.status === 403) {
      this.logger.error(
        'datos.gov.co rechazó el app token (DATOS_GOV_APP_TOKEN). Revisa la variable de entorno.',
      );
      throw apiError(
        ErrorCodes.INTERNAL_ERROR,
        502,
        'No pudimos consultar los datos del MEN. Intenta de nuevo en unos minutos.',
      );
    }

    if (!respuesta.ok) {
      this.logger.error(`datos.gov.co respondió ${respuesta.status} para el código ${codigo}`);
      throw apiError(
        ErrorCodes.INTERNAL_ERROR,
        502,
        'No pudimos consultar los datos del MEN. Intenta de nuevo en unos minutos.',
      );
    }

    const cuerpo: unknown = await respuesta.json().catch(() => null);
    if (!Array.isArray(cuerpo) || cuerpo.length === 0) {
      throw apiError(
        ErrorCodes.NOT_FOUND,
        404,
        'No encontramos un establecimiento educativo con ese código DANE. Revísalo o escribe los datos a mano.',
      );
    }
    return cuerpo[0] as FilaEstablecimiento;
  }

  /** Normaliza la fila del MEN al contrato de la web. */
  private aColegio(codigo: string, fila: FilaEstablecimiento): ColegioDane {
    return {
      codigoDane: codigo,
      anio: this.numero(fila.a_o) ?? 0,
      nombre: this.texto(fila.nombre_establecimiento) ?? '',
      municipio: this.texto(fila.municipio) ?? '',
      departamento: this.texto(fila.departamento) ?? '',
      direccion: this.texto(fila.direccion),
      telefono: this.texto(fila.telefono),
      email: this.primeraDireccion(fila.email),
      calendario: fila.calendario === Calendario.B ? Calendario.B : Calendario.A,
      sector: this.texto(fila.sector),
      caracter: this.texto(fila.caracter),
      rector: this.texto(fila.rector),
      matricula: this.numero(fila.total_matricula) ?? 0,
      sedes: this.numero(fila.cantidad_sedes) ?? 0,
    };
  }

  private texto(valor: string | undefined): string | null {
    if (valor === undefined) return null;
    const limpio = valor.trim();
    return limpio === '' ? null : limpio;
  }

  private numero(valor: string | undefined): number | null {
    const limpio = this.texto(valor);
    if (limpio === null) return null;
    const n = Number(limpio.replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  /**
   * El campo `email` del MEN a veces trae DOS direcciones separadas por espacio
   * (dato sucio real). Se devuelve la primera que tenga forma de correo.
   */
  private primeraDireccion(valor: string | undefined): string | null {
    const limpio = this.texto(valor);
    if (limpio === null) return null;
    const correo = limpio
      .split(/[\s,;]+/)
      .find((parte) => parte.includes('@') && parte.includes('.'));
    return correo ?? null;
  }
}
