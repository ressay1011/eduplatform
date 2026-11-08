/**
 * Resolución de filas CSV (unidad, sin BD).
 * La regla es estricta a propósito: no adivina cursos ni jornadas.
 */
import { describe, expect, it } from 'vitest';
import type { CursoMatricula } from '@eduplatform/types';
import {
  condicionDeTexto,
  ErrorMatricula,
  jornadaDeTexto,
  numeroDeGrado,
  resolverCursoCsv,
  tipoDocumentoDeTexto,
} from '../matriculas.curso';

const CURSOS: CursoMatricula[] = [
  {
    id: 'c1',
    nombre: '6° A',
    grado: 6,
    letra: 'A',
    jornada: 'MANANA',
    sedeId: 's1',
    sedeNombre: 'Sede Principal',
    anioLectivoId: 'a1',
    anio: 2026,
  },
  {
    id: 'c2',
    nombre: 'Transición B',
    grado: 0,
    letra: 'B',
    jornada: 'TARDE',
    sedeId: 's1',
    sedeNombre: 'Sede Principal',
    anioLectivoId: 'a1',
    anio: 2026,
  },
];

describe('numeroDeGrado', () => {
  it('acepta número, símbolo de grado y Transición', () => {
    expect(numeroDeGrado('6')).toBe(6);
    expect(numeroDeGrado('6°')).toBe(6);
    expect(numeroDeGrado('Transición')).toBe(0);
    expect(numeroDeGrado('preescolar')).toBe(0);
    expect(numeroDeGrado('grado 11')).toBe(11);
  });

  it('rechaza grados fuera de rango o sin dígitos', () => {
    expect(numeroDeGrado('12')).toBeNull();
    expect(numeroDeGrado('sexto')).toBeNull();
  });
});

describe('jornadaDeTexto', () => {
  it('normaliza tildes, mayúsculas y sinónimos', () => {
    expect(jornadaDeTexto('Mañana')).toBe('MANANA');
    expect(jornadaDeTexto('MANANA')).toBe('MANANA');
    expect(jornadaDeTexto('Única')).toBe('UNICA');
    expect(jornadaDeTexto('Sabatina')).toBe('FIN_SEMANA');
  });

  it('devuelve null con texto desconocido', () => {
    expect(jornadaDeTexto('madrugada')).toBeNull();
  });
});

describe('resolverCursoCsv', () => {
  it('resuelve con sede sin mayúsculas, grado con símbolo y letra minúscula', () => {
    const curso = resolverCursoCsv(CURSOS, {
      documento: '12345678',
      sede: 'sede principal',
      grado: '6°',
      letra: 'a',
      jornada: 'Mañana',
    });
    expect(curso.id).toBe('c1');
  });

  it('reporta sede inexistente con un motivo legible', () => {
    expect(() =>
      resolverCursoCsv(CURSOS, {
        documento: '12345678',
        sede: 'Sede Norte',
        grado: '6',
        letra: 'A',
        jornada: 'MANANA',
      }),
    ).toThrow(ErrorMatricula);
  });

  it('reporta grado inválido antes de buscar el curso', () => {
    expect(() =>
      resolverCursoCsv(CURSOS, {
        documento: '12345678',
        sede: 'Sede Principal',
        grado: 'sexto',
        letra: 'A',
        jornada: 'MANANA',
      }),
    ).toThrow(/Grado inválido/);
  });
});

describe('condicionDeTexto', () => {
  it('acepta los textos del CSV sin distinguir caja ni tildes', () => {
    expect(condicionDeTexto('Nuevo')).toBe('NUEVO');
    expect(condicionDeTexto('repitente')).toBe('REPITENTE');
    expect(condicionDeTexto('  REINGRESO ')).toBe('REINGRESO');
    expect(condicionDeTexto('Trasladada')).toBe('TRASLADADO');
    expect(condicionDeTexto('antigua')).toBe('ANTIGUO');
  });

  it('devuelve null con un texto que no es una condición', () => {
    expect(condicionDeTexto('Pepito')).toBeNull();
    expect(condicionDeTexto('')).toBeNull();
  });
});

describe('tipoDocumentoDeTexto', () => {
  it('acepta siglas y nombres, sin caja ni tildes', () => {
    expect(tipoDocumentoDeTexto('cc')).toBe('CC');
    expect(tipoDocumentoDeTexto('Ti')).toBe('TI');
    expect(tipoDocumentoDeTexto('Cédula')).toBe('CC');
    expect(tipoDocumentoDeTexto('tarjeta de identidad')).toBe('TI');
    expect(tipoDocumentoDeTexto('PPT')).toBe('PPT');
  });

  it('devuelve null con un tipo que no existe', () => {
    expect(tipoDocumentoDeTexto('pasaporte')).toBeNull();
    expect(tipoDocumentoDeTexto('')).toBeNull();
  });
});
