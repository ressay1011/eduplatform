/**
 * Saneado del nombre institucional del MEN.
 *
 * Los casos salen del corpus real de 2025 (17.872 establecimientos), no de
 * ejemplos inventados: si uno de estos cambia de forma, es una regresión.
 */
import { describe, expect, it } from 'vitest';
import { nombreOficialMen, nombreSaneado } from '../index';

describe('nombreSaneado', () => {
  it.each([
    [
      'INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
      'I.E.T.D. Juana Arias de Benavides',
    ],
    ['INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL DE GERMANIA', 'I.E.T.D. de Germania'],
    ['INSTITUCION EDUCATIVA TECNICA AGROPECUARIA JUBANGUANA', 'I.E.T.A. Jubanguana'],
    ['INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL AGROAMBIENTAL SAN JOSE', 'I.E.T.D.A. San José'],
    ['CENTRO EDUCATIVO RURAL MAIZ BLANCO', 'C.E.R. Maíz Blanco'],
    ['INSTITUTO TECNICO MERCEDES ABREGO', 'I.T. Mercedes Abrego'],
    ['COLEGIO SAN JOSE DE CALASANZ', 'C. San José de Calasanz'],
    ['ESCUELA NORMAL SUPERIOR DE POPAYAN', 'E.N.S. de Popayán'],
    ['CENTRO EDUCATIVO NIÑO JESÚS', 'C.E. Niño Jesús'],
    ['COLEGIO LA FLORESTA SUR (IED)', 'C. La Floresta Sur'],
    ['INSTITUCION  EDUCATIVA  LAS MESAS  INSEM', 'I.E. Las Mesas Insem'],
  ])('sanea «%s»', (entrada, esperado) => {
    expect(nombreSaneado(entrada)).toBe(esperado);
  });

  it('expande las abreviaturas sueltas del MEN antes de abreviar', () => {
    expect(nombreSaneado('INST EDUC LICEO JOAQUIN F. VELEZ')).toBe('I.E.L. Joaquín F. Vélez');
    expect(nombreSaneado('I.E. LA TRIBUNA')).toBe('I.E. La Tribuna');
    expect(nombreSaneado('COL SAN JOSE')).toBe('C. San José');
  });

  it('no se come las palabras que no son del bloque oficial', () => {
    expect(nombreSaneado('JARDIN INFANTIL EL ARCA')).toBe('J. Infantil El Arca');
    expect(nombreSaneado('COLEGIO CRISTIANO SHALOM')).toBe('C. Cristiano Shalom');
    expect(nombreSaneado('INSTITUCION EDUCATIVA LICEO MODERNO DEL SUR')).toBe(
      'I.E.L. Moderno del Sur',
    );
  });

  it('deja intacto un nombre sin contenedores, solo en Título', () => {
    expect(nombreSaneado('MI PEQUEÑO MUNDO')).toBe('Mi Pequeño Mundo');
    expect(nombreSaneado('SAN JOSE DEL PURGATORIO')).toBe('San José del Purgatorio');
  });

  it('conserva siglas con punto y no duplica espacios', () => {
    expect(nombreSaneado('LICEO  CAMPESTRE   S.A.S')).toBe('L. Campestre S.A.S');
  });

  it('no falla con entradas raras', () => {
    expect(nombreSaneado('')).toBe('');
    expect(nombreSaneado('   ')).toBe('');
    expect(nombreSaneado('INSTITUCION EDUCATIVA')).toBe('I.E.');
  });
});

describe('nombreOficialMen', () => {
  it.each([
    [
      'INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
      'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL JUANA ARIAS DE BENAVIDES',
    ],
    [
      'INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL VICTOR CAMARGO ALVAREZ',
      'INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL VÍCTOR CAMARGO ÁLVAREZ',
    ],
    ['CENTRO EDUCATIVO RURAL MAIZ BLANCO', 'CENTRO EDUCATIVO RURAL MAÍZ BLANCO'],
    ['INSTITUCION EDUCATIVA AGRICOLA DE POPAYAN', 'INSTITUCIÓN EDUCATIVA AGRÍCOLA DE POPAYÁN'],
  ])('pone en mayúsculas con tildes «%s»', (entrada, esperado) => {
    expect(nombreOficialMen(entrada)).toBe(esperado);
  });

  it('expande abreviaturas y quita marcas de relleno', () => {
    expect(nombreOficialMen('INST EDUC LICEO JOAQUIN F. VELEZ')).toBe(
      'INSTITUCIÓN EDUCATIVA LICEO JOAQUÍN F. VÉLEZ',
    );
    expect(nombreOficialMen('COLEGIO JUAN REY (IED)')).toBe('COLEGIO JUAN REY');
  });

  it('no inventa nada sobre un nombre ya correcto', () => {
    expect(nombreOficialMen('COLEGIO SAN JOSÉ DE CALASANZ')).toBe('COLEGIO SAN JOSÉ DE CALASANZ');
    expect(nombreOficialMen('')).toBe('');
  });
});
