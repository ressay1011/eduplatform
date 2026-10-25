/** CSV de matrículas: lectura, resolución de curso y plantilla (unidad). */
import { describe, expect, it } from 'vitest';
import type { CursoMatricula } from '@eduplatform/types';
import {
  aFilaRequest,
  motivoFilaCsv,
  normalizarJornada,
  numeroDeGrado,
  parsearCsvMatriculas,
  plantillaMatriculasCsv,
  resolverCursoCsv,
} from '../matriculas';

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
];

const CSV = [
  'documento,nombres,apellidos,correo,sede,grado,letra,jornada,fechaNacimiento',
  '1098765432,Ana María,Gómez Ruiz,ana@cole.edu.co,Sede Principal,6,A,Mañana,2013-04-18',
  '1098765433,"Pérez, Juan",López,,Sede Principal,6°,a,Tarde',
].join('\r\n');

describe('parsearCsvMatriculas', () => {
  it('salta el encabezado y lee las filas con su número de línea', () => {
    const { filas, errores } = parsearCsvMatriculas(CSV);
    expect(errores).toEqual([]);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({
      linea: 2,
      documento: '1098765432',
      nombres: 'Ana María',
      apellidos: 'Gómez Ruiz',
      sede: 'Sede Principal',
      grado: '6',
      letra: 'A',
      jornada: 'Mañana',
      fechaNacimiento: '2013-04-18',
    });
  });

  it('respeta comas dentro de comillas y deja fechaNacimiento fuera si viene vacía', () => {
    const { filas } = parsearCsvMatriculas(CSV);
    expect(filas[1]?.nombres).toBe('Pérez, Juan');
    expect(filas[1]?.fechaNacimiento).toBeUndefined();
  });

  it('reporta líneas incompletas sin descartar las válidas', () => {
    const { filas, errores } = parsearCsvMatriculas(
      ['documento,nombres,apellidos,correo,sede,grado,letra,jornada', 'solo,dos'].join('\n'),
    );
    expect(filas).toHaveLength(0);
    expect(errores[0]).toContain('Línea 2: faltan columnas');
  });

  it('avisa cuando el archivo está vacío', () => {
    expect(parsearCsvMatriculas('').errores[0]).toContain('no tiene filas');
  });
});

describe('resolución de curso y motivo', () => {
  it('normaliza grado y jornada como la API', () => {
    expect(numeroDeGrado('6°')).toBe(6);
    expect(numeroDeGrado('Transición')).toBe(0);
    expect(normalizarJornada('mañana')).toBe('MANANA');
    expect(normalizarJornada('Sabatina')).toBe('FIN_SEMANA');
    expect(normalizarJornada('madrugada')).toBeNull();
  });

  it('una fila coherente resuelve el curso y no tiene motivo de error', () => {
    const fila = parsearCsvMatriculas(CSV).filas[0];
    if (fila === undefined) throw new Error('Fila esperada');
    expect(resolverCursoCsv(CURSOS, fila)?.id).toBe('c1');
    expect(motivoFilaCsv(CURSOS, fila)).toBeNull();
  });

  it('marca los datos faltantes y el curso inexistente', () => {
    const base = {
      linea: 2,
      documento: '1098765432',
      nombres: '',
      apellidos: '',
      correo: '',
      sede: 'Sede Principal',
      grado: '6',
      letra: 'A',
      jornada: 'Mañana',
    };
    expect(motivoFilaCsv(CURSOS, { ...base, documento: '' })).toBe('Falta el documento');
    expect(motivoFilaCsv(CURSOS, { ...base, sede: 'Sede Norte' })).toContain('no existe');
    expect(motivoFilaCsv(CURSOS, { ...base, jornada: 'madrugada' })).toContain('Jornada inválida');
  });

  it('convierte la fila al contrato sin enviar campos vacíos', () => {
    const fila = parsearCsvMatriculas(CSV).filas[1];
    if (fila === undefined) throw new Error('Fila esperada');
    const dto = aFilaRequest(fila);
    expect(dto).toEqual({
      documento: '1098765433',
      nombres: 'Pérez, Juan',
      apellidos: 'López',
      sede: 'Sede Principal',
      grado: '6°',
      letra: 'a',
      jornada: 'Tarde',
    });
    expect('correo' in dto).toBe(false);
    expect('fechaNacimiento' in dto).toBe(false);
  });
});

describe('plantillaMatriculasCsv', () => {
  it('trae encabezado y una fila de ejemplo', () => {
    const lineas = plantillaMatriculasCsv().split('\r\n');
    expect(lineas[0]).toContain('documento,nombres,apellidos,correo,sede,grado,letra,jornada');
    expect(lineas[1]?.split(',')[0]).toBe('1098765432');
  });
});
