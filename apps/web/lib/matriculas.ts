/**
 * CSV de matrículas (paso 5 del onboarding) — utilidades puras del cliente.
 *
 * El formato es el de la plantilla:
 *   documento,nombres,apellidos,correo,sede,grado,letra,jornada[,fechaNacimiento]
 *
 * El cliente solo hace una validación de forma y resuelve el curso contra los
 * cursos reales para la vista previa; la API vuelve a validar todo (es la
 * fuente de verdad) y reporta los errores por fila.
 */
import type { CursoMatricula, FilaMatriculaRequest } from '@eduplatform/types';

/** Fila leída del CSV, con el número de línea del archivo (1-based). */
export interface FilaCsvMatricula {
  linea: number;
  documento: string;
  nombres: string;
  apellidos: string;
  correo: string;
  sede: string;
  grado: string;
  letra: string;
  jornada: string;
  fechaNacimiento?: string;
}

export interface CsvMatriculasLeido {
  filas: FilaCsvMatricula[];
  errores: string[];
}

const COLUMNAS = 8;

/** Divide una línea CSV respetando las comillas dobles. */
function dividirLinea(linea: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i] ?? '';
    if (caracter === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
      continue;
    }
    if (caracter === ',' && !entreComillas) {
      campos.push(actual.trim());
      actual = '';
      continue;
    }
    actual += caracter;
  }
  campos.push(actual.trim());
  return campos;
}

/** Minúsculas sin acentos (para detectar el encabezado). */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Lee el texto del CSV. Ignora líneas vacías, acepta encabezado y tolera BOM
 * y CRLF. Las filas con menos columnas se reportan como error de archivo.
 */
export function parsearCsvMatriculas(texto: string): CsvMatriculasLeido {
  const errores: string[] = [];
  const filas: FilaCsvMatricula[] = [];
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/);

  let primera = true;
  for (const [indice, cruda] of lineas.entries()) {
    const linea = cruda.trim();
    if (linea === '') continue;

    if (primera) {
      primera = false;
      // Encabezado opcional: si la primera celda es «documento», se salta.
      const cabecera = dividirLinea(linea).map(normalizar);
      if (cabecera[0]?.includes('documento') === true) continue;
    }

    const campos = dividirLinea(linea);
    if (campos.length < COLUMNAS) {
      errores.push(
        `Línea ${indice + 1}: faltan columnas (se esperaban ${COLUMNAS} y llegaron ${campos.length})`,
      );
      continue;
    }

    const fechaNacimiento = campos[8] ?? '';
    filas.push({
      linea: indice + 1,
      documento: campos[0] ?? '',
      nombres: campos[1] ?? '',
      apellidos: campos[2] ?? '',
      correo: campos[3] ?? '',
      sede: campos[4] ?? '',
      grado: campos[5] ?? '',
      letra: campos[6] ?? '',
      jornada: campos[7] ?? '',
      ...(fechaNacimiento === '' ? {} : { fechaNacimiento }),
    });
  }

  if (filas.length === 0 && errores.length === 0) {
    errores.push('El archivo no tiene filas de matrícula.');
  }
  return { filas, errores };
}

/** «Transición»/«0» → 0; «6»/«6°» → 6. */
export function numeroDeGrado(texto: string): number | null {
  const limpio = normalizar(texto);
  if (limpio.includes('transicion') || limpio.includes('preescolar')) return 0;
  const digitos = limpio.replace(/\D/g, '');
  if (digitos === '') return null;
  const numero = Number(digitos);
  return Number.isInteger(numero) && numero >= 0 && numero <= 11 ? numero : null;
}

const JORNADAS: Record<string, string> = {
  manana: 'MANANA',
  am: 'MANANA',
  tarde: 'TARDE',
  pm: 'TARDE',
  noche: 'NOCTURNA',
  nocturna: 'NOCTURNA',
  unica: 'UNICA',
  sabado: 'FIN_SEMANA',
  sabados: 'FIN_SEMANA',
  sabatina: 'FIN_SEMANA',
  findesemana: 'FIN_SEMANA',
  'fin de semana': 'FIN_SEMANA',
};

export function normalizarJornada(texto: string): string | null {
  return JORNADAS[normalizar(texto)] ?? null;
}

/**
 * Curso que corresponde a la fila, o null si no se puede resolver. Es la
 * misma regla que aplica la API (sede + grado + letra + jornada exactos).
 */
export function resolverCursoCsv(
  cursos: CursoMatricula[],
  fila: FilaCsvMatricula,
): CursoMatricula | null {
  const grado = numeroDeGrado(fila.grado);
  const jornada = normalizarJornada(fila.jornada);
  const letra = fila.letra.trim().toUpperCase();
  if (grado === null || jornada === null || !/^[A-Z]$/.test(letra)) return null;

  return (
    cursos.find(
      (curso) =>
        normalizar(curso.sedeNombre) === normalizar(fila.sede) &&
        curso.grado === grado &&
        curso.letra === letra &&
        curso.jornada === jornada,
    ) ?? null
  );
}

/**
 * Motivo por el que la fila no se puede importar, o null si está lista.
 * No consulta la BD: duplicados y cuentas inexistentes los reporta la API.
 */
export function motivoFilaCsv(cursos: CursoMatricula[], fila: FilaCsvMatricula): string | null {
  if (fila.documento.trim() === '') return 'Falta el documento';
  if (fila.sede.trim() === '' || fila.grado.trim() === '' || fila.letra.trim() === '') {
    return 'Faltan datos del curso';
  }
  if (normalizarJornada(fila.jornada) === null) return `Jornada inválida: «${fila.jornada}»`;
  if (resolverCursoCsv(cursos, fila) === null) {
    return 'El curso no existe en el colegio (sede, grado, letra o jornada)';
  }
  return null;
}

/** Convierte la fila al contrato de la API (sin campos vacíos). */
export function aFilaRequest(fila: FilaCsvMatricula): FilaMatriculaRequest {
  return {
    documento: fila.documento,
    sede: fila.sede,
    grado: fila.grado,
    letra: fila.letra,
    jornada: fila.jornada,
    ...(fila.nombres === '' ? {} : { nombres: fila.nombres }),
    ...(fila.apellidos === '' ? {} : { apellidos: fila.apellidos }),
    ...(fila.correo === '' ? {} : { correo: fila.correo }),
    ...(fila.fechaNacimiento === undefined ? {} : { fechaNacimiento: fila.fechaNacimiento }),
  };
}

/** Plantilla descargable: encabezado + una fila de ejemplo. */
export function plantillaMatriculasCsv(): string {
  return [
    'documento,nombres,apellidos,correo,sede,grado,letra,jornada,fechaNacimiento',
    '1098765432,Ana María,Gómez Ruiz,ana.gomez@cole.edu.co,Sede Principal,6,A,Mañana,2013-04-18',
  ].join('\r\n');
}

/** Descarga la plantilla (solo navegador; en tests se ignora). */
export function descargarPlantillaMatriculas(): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const contenido = plantillaMatriculasCsv();
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'plantilla-matriculas.csv';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
