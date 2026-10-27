/**
 * Onboarding · contratos del paso 1.
 *
 * Cubre la sugerencia de subdominio (que debe ser SIEMPRE válida para
 * `SubdominioSchema`) y que el dominio de correo ya no viaje en el formulario:
 * es la llave del login y no se edita desde el wizard.
 */
import { describe, expect, it } from 'vitest';
import { ColegioOnboardingSchema, SubdominioSchema, subdominioDeNombre } from '../index';

const COLEGIO = {
  nombre: 'I.E.T.D. Juana Arias de Benavides',
  codigoDane: '147555000295',
  subdominio: 'juana-arias',
  municipio: 'Plato',
  departamento: 'Magdalena',
  email: 'rectoria@juanaarias.edu.co',
  calendario: 'A' as const,
  anioLectivo: 2026,
  periodos: [
    { numero: 1, nombre: 'Período 1', fechaInicio: '2026-02-02', fechaFin: '2026-04-24' },
    { numero: 2, nombre: 'Período 2', fechaInicio: '2026-04-28', fechaFin: '2026-07-03' },
  ],
};

describe('subdominioDeNombre', () => {
  it('quita puntos y tildes y separa con guiones', () => {
    expect(subdominioDeNombre('I.E.T.D. Juana Arias de Benavides')).toBe(
      'ietd-juana-arias-de-benavides',
    );
    expect(subdominioDeNombre('Colegio San José')).toBe('colegio-san-jose');
  });

  it('devuelve cadena vacía si no alcanza el mínimo de 3 caracteres', () => {
    expect(subdominioDeNombre('I.E.')).toBe('');
    expect(subdominioDeNombre('  á  ')).toBe('');
  });

  it('recorta a 32 caracteres sin terminar en guion', () => {
    const largo = subdominioDeNombre(
      'Institución Educativa Técnica Departamental Juana Arias de Benavides',
    );
    expect(largo.length).toBeLessThanOrEqual(32);
    expect(largo.endsWith('-')).toBe(false);
    expect(SubdominioSchema.safeParse(largo).success).toBe(true);
  });

  it.each([
    'I.E. Demo',
    'Colegio Campestre La Sabana',
    'Normal Superior de Sincelejo',
    'C.E.R. María Estévez',
  ])('el resultado de "%s" siempre pasa SubdominioSchema', (nombre) => {
    expect(SubdominioSchema.safeParse(subdominioDeNombre(nombre)).success).toBe(true);
  });
});

describe('ColegioOnboardingSchema', () => {
  it('acepta el paso 1 sin dominio de correo', () => {
    const r = ColegioOnboardingSchema.safeParse(COLEGIO);
    expect(r.success).toBe(true);
  });

  it('descarta el dominio de correo si un cliente viejo lo envía', () => {
    const r = ColegioOnboardingSchema.parse({ ...COLEGIO, dominioEmail: 'otro-dominio.edu.co' });
    expect('dominioEmail' in r).toBe(false);
  });

  it('exige 12 dígitos en el código DANE', () => {
    expect(ColegioOnboardingSchema.safeParse({ ...COLEGIO, codigoDane: '123' }).success).toBe(
      false,
    );
  });
});
