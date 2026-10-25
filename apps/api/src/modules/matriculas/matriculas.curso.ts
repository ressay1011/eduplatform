/**
 * Resolución de la fila CSV contra los cursos reales del colegio.
 *
 * Es deliberadamente estricta: la sede, el grado, la letra y la jornada deben
 * coincidir con un curso existente del año vigente. Nunca «adivina» ni crea
 * cursos: un CSV con datos que no cuadran se reporta fila por fila.
 */
import type { CursoMatricula, FilaMatriculaRequest, Jornada } from '@eduplatform/types';
import { Jornada as Jornadas } from '@eduplatform/types';

/** Error de negocio de una fila: el mensaje se devuelve tal cual al usuario. */
export class ErrorMatricula extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ErrorMatricula';
  }
}

/** Minúsculas, sin acentos y sin espacios sobrantes (para comparar). */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const JORNADAS_POR_TEXTO: Record<string, Jornada> = {
  manana: Jornadas.MANANA,
  am: Jornadas.MANANA,
  tarde: Jornadas.TARDE,
  pm: Jornadas.TARDE,
  noche: Jornadas.NOCTURNA,
  nocturna: Jornadas.NOCTURNA,
  unica: Jornadas.UNICA,
  sabado: Jornadas.FIN_SEMANA,
  sabados: Jornadas.FIN_SEMANA,
  sabatina: Jornadas.FIN_SEMANA,
  'fin de semana': Jornadas.FIN_SEMANA,
  findesemana: Jornadas.FIN_SEMANA,
};

/** «Transición»/«0» → 0; «6»/«6°» → 6. Devuelve null si no es un grado válido. */
export function numeroDeGrado(texto: string): number | null {
  const limpio = normalizar(texto);
  if (limpio.includes('transicion') || limpio.includes('preescolar')) return 0;
  const digitos = limpio.replace(/\D/g, '');
  if (digitos === '') return null;
  const numero = Number(digitos);
  return Number.isInteger(numero) && numero >= 0 && numero <= 11 ? numero : null;
}

/** Acepta «Mañana», «MANANA», «am», «Sabatina»… */
export function jornadaDeTexto(texto: string): Jornada | null {
  const limpio = normalizar(texto);
  return JORNADAS_POR_TEXTO[limpio] ?? null;
}

/**
 * Encuentra el curso de la fila. Lanza `ErrorMatricula` con un motivo legible
 * cuando el curso no existe o los datos no permiten resolverlo.
 */
export function resolverCursoCsv(
  cursos: CursoMatricula[],
  fila: FilaMatriculaRequest,
): CursoMatricula {
  const grado = numeroDeGrado(fila.grado);
  if (grado === null) throw new ErrorMatricula(`Grado inválido: «${fila.grado}»`);

  const letra = normalizar(fila.letra).toUpperCase();
  if (!/^[A-Z]$/.test(letra)) throw new ErrorMatricula(`Letra inválida: «${fila.letra}»`);

  const jornada = jornadaDeTexto(fila.jornada);
  if (jornada === null) throw new ErrorMatricula(`Jornada inválida: «${fila.jornada}»`);

  const sedeBuscada = normalizar(fila.sede);
  const candidatos = cursos.filter(
    (curso) =>
      normalizar(curso.sedeNombre) === sedeBuscada &&
      curso.grado === grado &&
      curso.letra === letra &&
      curso.jornada === jornada,
  );

  const curso = candidatos[0];
  if (curso === undefined) {
    const etiqueta = grado === 0 ? 'Transición' : `${grado}°`;
    throw new ErrorMatricula(
      `No existe el curso ${etiqueta}${letra} (${jornada}) en la sede «${fila.sede}»`,
    );
  }
  if (candidatos.length > 1) {
    throw new ErrorMatricula(
      `Hay más de un curso ${curso.nombre} (${jornada}) en la sede «${fila.sede}»`,
    );
  }
  return curso;
}
