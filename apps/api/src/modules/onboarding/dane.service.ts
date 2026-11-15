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
import {
  Calendario,
  ErrorCodes,
  Jornada,
  nombreSedeMen,
  type ColegioDane,
  type SedeMen,
} from '@eduplatform/types';
import { env } from '../../config/env';
import { apiError } from '../../shared/api-error';

/** Dataset «ESTABLECIMIENTOS EDUCATIVOS» del MEN (Socrata). */
const URL_DATASET = 'https://www.datos.gov.co/resource/cfw5-qzt5.json';
/**
 * Matrícula por sede/jornada/grado. El dataset de establecimientos no trae ni
 * sedes ni jornadas, y el DEPA (`emd6-ef7x`) solo cubre Boyacá —fuera de allí
 * devuelve `[]`—, así que la fuente que sirve en todo el país es esta.
 */
const URL_SEDES = 'https://www.datos.gov.co/resource/ngw5-c5nw.json';
/** Orden en que la UI muestra las jornadas (el del enum, sin «Fin de semana»). */
const ORDEN_JORNADAS: Jornada[] = [
  Jornada.MANANA,
  Jornada.TARDE,
  Jornada.COMPLETA,
  Jornada.UNICA,
  Jornada.NOCTURNA,
  Jornada.FIN_SEMANA,
];
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

/** Fila cruda del dataset de sedes (todo llega como texto). */
interface FilaSede {
  anno_inf?: string;
  codigo_dane_sede?: string;
  nombre_sede?: string;
  zona?: string;
  tipo_jornada?: string;
  matricula?: string;
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

    // En serie y no en paralelo: el año del reporte del establecimiento acota la
    // consulta de sedes. Sin él, Socrata agrupa todas las vigencias y la petición
    // se pasa de los 8 s en colegios grandes (medido con el piloto).
    const fila = await this.consultar(codigo);
    const men = await this.consultarSedes(codigo, this.numero(fila.a_o) ?? undefined);
    const datos = this.aColegio(codigo, fila, men.jornadas, men.sedesMen);

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

  /**
   * Sedes que el MEN publica para el establecimiento, con sus jornadas, su zona
   * y su matrícula; y, de ahí, las jornadas que ofrece el colegio.
   *
   * Es una sugerencia: si el dataset no responde o no tiene la fila, se devuelve
   * vacío y el wizard sigue funcionando a mano.
   *
   * Se agrupa por (año, sede, jornada) y se toma **solo el año más reciente**: la
   * unión histórica arrastra jornadas retiradas («Fin de Semana» solo aparece en
   * 2010) y sedes que ya no existen.
   */
  private async consultarSedes(
    codigo: string,
    anioReporte: number | undefined,
  ): Promise<{ jornadas: Jornada[]; sedesMen: SedeMen[] }> {
    const vacio: { jornadas: Jornada[]; sedesMen: SedeMen[] } = { jornadas: [], sedesMen: [] };
    // La matrícula puede ir un año por detrás del establecimiento: se piden dos
    // vigencias y en código se toma la mayor.
    const desde = anioReporte === undefined ? 0 : anioReporte - 1;
    const url = new URL(URL_SEDES);
    url.searchParams.set(
      '$where',
      desde === 0 ? `codigo_dane=${codigo}` : `codigo_dane=${codigo} AND anno_inf >= ${desde}`,
    );
    url.searchParams.set(
      '$select',
      'anno_inf,codigo_dane_sede,nombre_sede,zona,tipo_jornada,sum(total_matricula) as matricula',
    );
    url.searchParams.set('$group', 'anno_inf,codigo_dane_sede,nombre_sede,zona,tipo_jornada');
    url.searchParams.set('$order', 'anno_inf DESC');

    const cabeceras: Record<string, string> = { Accept: 'application/json' };
    if (env.DATOS_GOV_APP_TOKEN !== undefined) {
      cabeceras['X-App-Token'] = env.DATOS_GOV_APP_TOKEN;
    }

    try {
      const respuesta = await fetch(url, {
        headers: cabeceras,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!respuesta.ok) return vacio;
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (!Array.isArray(cuerpo) || cuerpo.length === 0) return vacio;

      const filas = cuerpo as FilaSede[];
      const ultimoAnio = filas.reduce((max, f) => Math.max(max, this.numero(f.anno_inf) ?? 0), 0);

      const porSede = new Map<
        string,
        { nombre: string; zona: string | null; jornadas: Set<Jornada>; matricula: number }
      >();
      for (const fila of filas) {
        if ((this.numero(fila.anno_inf) ?? 0) !== ultimoAnio) continue;
        const codigoSede = this.texto(fila.codigo_dane_sede);
        if (codigoSede === null) continue;
        const actual = porSede.get(codigoSede) ?? {
          nombre: this.texto(fila.nombre_sede) ?? '',
          zona: this.texto(fila.zona),
          jornadas: new Set<Jornada>(),
          matricula: 0,
        };
        for (const jornada of this.aJornadas(this.texto(fila.tipo_jornada) ?? '')) {
          actual.jornadas.add(jornada);
        }
        actual.matricula += this.numero(fila.matricula) ?? 0;
        porSede.set(codigoSede, actual);
      }

      const sedesMen: SedeMen[] = [...porSede.entries()]
        .map(([codigoDaneSede, sede]) => ({
          codigoDaneSede,
          nombre: nombreSedeMen(sede.nombre),
          jornadas: ORDEN_JORNADAS.filter((j) => sede.jornadas.has(j)),
          zona: sede.zona,
          matricula: sede.matricula,
          esPrincipal: codigoDaneSede === codigo,
        }))
        // La principal primero (es la que más matrícula tiene) y luego por tamaño.
        .sort((a, b) => b.matricula - a.matricula);

      return {
        sedesMen,
        jornadas: ORDEN_JORNADAS.filter((j) => sedesMen.some((s) => s.jornadas.includes(j))),
      };
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer las sedes del MEN para el código ${codigo}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return vacio;
    }
  }

  /** «MAÑANA,COMPLETA,TARDE» → `[MANANA, COMPLETA, TARDE]`, sin repetir. */
  private aJornadas(valor: string | undefined): Jornada[] {
    const limpio = this.texto(valor);
    if (limpio === null) return [];
    const mapa: Record<string, Jornada> = {
      MANANA: Jornada.MANANA,
      TARDE: Jornada.TARDE,
      COMPLETA: Jornada.COMPLETA,
      UNICA: Jornada.UNICA,
      NOCTURNA: Jornada.NOCTURNA,
      NOCHE: Jornada.NOCTURNA,
      'FIN DE SEMANA': Jornada.FIN_SEMANA,
      SABATINA: Jornada.FIN_SEMANA,
    };
    const salida: Jornada[] = [];
    for (const parte of limpio.split(',')) {
      // El dataset mezcla mayúsculas, tildes y espacios de más.
      const clave = parte
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
      const jornada = mapa[clave];
      if (jornada !== undefined && !salida.includes(jornada)) salida.push(jornada);
    }
    return salida;
  }

  /** Normaliza la fila del MEN al contrato de la web. */
  private aColegio(
    codigo: string,
    fila: FilaEstablecimiento,
    jornadas: Jornada[],
    sedesMen: SedeMen[],
  ): ColegioDane {
    return {
      codigoDane: codigo,
      anio: this.numero(fila.a_o) ?? 0,
      nombre: this.texto(fila.nombre_establecimiento) ?? '',
      municipio: this.texto(fila.municipio) ?? '',
      departamento: this.texto(fila.departamento) ?? '',
      direccion: this.texto(fila.direccion),
      telefono: this.primerTelefono(fila.telefono),
      email: this.primeraDireccion(fila.email),
      calendario: fila.calendario === Calendario.B ? Calendario.B : Calendario.A,
      sector: this.texto(fila.sector),
      caracter: this.texto(fila.caracter),
      rector: this.texto(fila.rector),
      matricula: this.numero(fila.total_matricula) ?? 0,
      sedes: this.numero(fila.cantidad_sedes) ?? 0,
      jornadas,
      sedesMen,
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
   * El campo `telefono` del MEN también llega sucio: «7422210/7422215»,
   * «7422210 - 7422215». Se queda el primero; si no hay dígitos, sin teléfono.
   */
  private primerTelefono(valor: string | undefined): string | null {
    const limpio = this.texto(valor);
    if (limpio === null) return null;
    const primero = limpio.split(/[/,;]|\s-\s/)[0]?.trim() ?? '';
    return /\d/.test(primero) ? primero : null;
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
