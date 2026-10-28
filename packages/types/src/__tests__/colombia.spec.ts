/** Catálogo de departamentos y municipios (generado del MEN). */
import { describe, expect, it } from 'vitest';
import {
  DEPARTAMENTOS,
  esDepartamento,
  esMunicipio,
  municipiosDe,
  NOMBRES_DEPARTAMENTOS,
} from '../index';

describe('catálogo de Colombia', () => {
  it('cubre los 32 departamentos y Bogotá D.C.', () => {
    expect(NOMBRES_DEPARTAMENTOS).toHaveLength(33);
    expect(esDepartamento('Magdalena')).toBe(true);
    expect(esDepartamento('Bogotá, D.C.')).toBe(true);
    expect(esDepartamento('Narnia')).toBe(false);
  });

  it('devuelve los municipios de un departamento', () => {
    const magdalena = municipiosDe('Magdalena');
    expect(magdalena).toContain('Plato');
    expect(magdalena).toContain('Santa Marta');
    expect(municipiosDe('Narnia')).toEqual([]);
  });

  it('valida la pareja departamento + municipio', () => {
    expect(esMunicipio('Magdalena', 'Plato')).toBe(true);
    expect(esMunicipio('Magdalena', 'Manizales')).toBe(false);
    expect(esMunicipio('Caldas', 'Manizales')).toBe(true);
  });

  it('no repite municipios dentro de un departamento', () => {
    for (const municipios of Object.values(DEPARTAMENTOS)) {
      expect(new Set(municipios).size).toBe(municipios.length);
    }
  });
});
