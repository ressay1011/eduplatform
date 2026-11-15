/**
 * Sedes del MEN en el paso 3: qué se ofrece y qué falta por crear.
 *
 * Los nombres son los siete reales del colegio del piloto; el modelo del MEN
 * los escribe en mayúsculas y sin tildes («EUM SAN JOSE»).
 */
import { describe, expect, it } from 'vitest';
import type { SedeMen, SedeOnboarding } from '@eduplatform/types';
import { sedesPendientes, yaLaTienes } from '../onboarding-sedes';

function men(parcial: Partial<SedeMen> & { codigoDaneSede: string }): SedeMen {
  return {
    nombre: `Sede ${parcial.codigoDaneSede}`,
    jornadas: ['MANANA'],
    zona: 'Urbana',
    departamento: 'Magdalena',
    municipio: 'Plato',
    matricula: 100,
    esPrincipal: false,
    ...parcial,
  };
}

function guardada(parcial: Partial<SedeOnboarding> & { nombre: string }): SedeOnboarding {
  return {
    id: parcial.nombre.toLowerCase(),
    codigoDaneSede: null,
    direccion: null,
    municipio: '',
    departamento: '',
    jornadas: ['MANANA'],
    ...parcial,
  };
}

describe('yaLaTienes', () => {
  it('reconoce la sede por su código DANE', () => {
    expect(
      yaLaTienes(men({ codigoDaneSede: '147555000040', nombre: 'San José' }), [
        guardada({ nombre: 'San José de la Montaña', codigoDaneSede: '147555000040' }),
      ]),
    ).toBe(true);
  });

  it('reconoce la sede por su nombre, sin tildes ni caja', () => {
    expect(
      yaLaTienes(men({ codigoDaneSede: '247555001067', nombre: 'Los Pozos' }), [
        guardada({ nombre: 'LOS POZOS' }),
      ]),
    ).toBe(true);
  });

  it('la principal del MEN cuenta si ya hay una «Principal», con o sin el prefijo «Sede»', () => {
    expect(
      yaLaTienes(
        men({
          codigoDaneSede: '147555000295',
          nombre: 'Juana Arias de Benavides',
          esPrincipal: true,
        }),
        [guardada({ nombre: 'Principal' })],
      ),
    ).toBe(true);
    // Una sede que no es la principal y no coincide no se da por creada.
    expect(
      yaLaTienes(men({ codigoDaneSede: '147555000040', nombre: 'San José' }), [
        guardada({ nombre: 'Principal' }),
      ]),
    ).toBe(false);
  });

  it('no confunde un código vacío con coincidencia', () => {
    expect(
      yaLaTienes(men({ codigoDaneSede: '147555000040', nombre: 'San José' }), [
        guardada({ nombre: 'Otra', codigoDaneSede: '' }),
      ]),
    ).toBe(false);
  });
});

describe('sedesPendientes', () => {
  it('devuelve solo las que faltan y conserva el orden del MEN', () => {
    const menSedes = [
      men({
        codigoDaneSede: '147555000295',
        nombre: 'Juana Arias de Benavides',
        esPrincipal: true,
      }),
      men({ codigoDaneSede: '147555000040', nombre: 'San José' }),
      men({ codigoDaneSede: '247555001067', nombre: 'Los Pozos' }),
    ];
    const pendientes = sedesPendientes(menSedes, [
      guardada({ nombre: 'Principal' }),
      guardada({ nombre: 'san jose', codigoDaneSede: '147555000040' }),
    ]);

    expect(pendientes.map((s) => s.nombre)).toEqual(['Los Pozos']);
  });

  it('sin sedes guardadas están todas pendientes', () => {
    const menSedes = [men({ codigoDaneSede: '147555000040', nombre: 'San José' })];
    expect(sedesPendientes(menSedes, [])).toHaveLength(1);
  });
});
