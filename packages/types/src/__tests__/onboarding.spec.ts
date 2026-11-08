/**
 * Onboarding · contratos del paso 1.
 *
 * El subdominio ya no viaja en el formulario: el colegio se identifica por su
 * código (creado por el administrador de plataforma).
 */
import { describe, expect, it } from 'vitest';
import { anioLocal } from '../fecha';
import { ColegioOnboardingSchema } from '../index';

/**
 * Año en curso: la ventana del año lectivo y las fechas de los períodos se
 * comparan con él, así que el fixture tiene que moverse con el calendario.
 */
// Año del calendario del colegio, no el del proceso: en CI (UTC) el 1-ene a las
// 02:00 el reloj ya cambió de año y la ventana ±1 es otra.
const ANIO = anioLocal();

/** Fecha ISO del año en curso, con el mes y el día indicados. */
function fecha(mes: number, dia: number): string {
  return `${ANIO}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const COLEGIO = {
  nombre: 'I.E.T.D. Juana Arias de Benavides',
  codigoDane: '147555000295',
  municipio: 'Plato',
  departamento: 'Magdalena',
  email: 'rectoria@juanaarias.edu.co',
  calendario: 'A' as const,
  anioLectivo: ANIO,
  periodos: [
    { numero: 1, nombre: 'Período 1', fechaInicio: fecha(2, 2), fechaFin: fecha(4, 24) },
    { numero: 2, nombre: 'Período 2', fechaInicio: fecha(4, 28), fechaFin: fecha(7, 3) },
  ],
};

describe('ColegioOnboardingSchema', () => {
  it('acepta el paso 1 sin subdominio ni dominio de correo', () => {
    const r = ColegioOnboardingSchema.safeParse(COLEGIO);
    expect(r.success).toBe(true);
  });

  it('descarta el subdominio si un cliente viejo lo envía', () => {
    const r = ColegioOnboardingSchema.parse({ ...COLEGIO, subdominio: 'juana-arias' });
    expect('subdominio' in r).toBe(false);
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

  it('acepta el colegio sin NIT', () => {
    expect(ColegioOnboardingSchema.safeParse({ ...COLEGIO, nit: undefined }).success).toBe(true);
    expect(ColegioOnboardingSchema.safeParse({ ...COLEGIO, nit: '' }).success).toBe(true);
  });

  it('acepta un NIT con puntos y verificador', () => {
    expect(ColegioOnboardingSchema.safeParse({ ...COLEGIO, nit: '900.123.456-7' }).success).toBe(
      true,
    );
  });

  it('rechaza un NIT con letras o con dos verificadores', () => {
    const letras = ColegioOnboardingSchema.safeParse({ ...COLEGIO, nit: 'NIT-900123456' });
    expect(letras.success).toBe(false);
    expect(letras.error?.issues[0]?.message).toMatch(/NIT inválido/);
    expect(ColegioOnboardingSchema.safeParse({ ...COLEGIO, nit: '900123456-77' }).success).toBe(
      false,
    );
  });

  it('solo acepta el año lectivo anterior, el actual y el próximo', () => {
    const fuera = ColegioOnboardingSchema.safeParse({ ...COLEGIO, anioLectivo: ANIO - 2 });
    expect(fuera.success).toBe(false);
    expect(fuera.error?.issues[0]?.message).toMatch(/año lectivo debe ser/);
    expect(ColegioOnboardingSchema.safeParse({ ...COLEGIO, anioLectivo: ANIO + 2 }).success).toBe(
      false,
    );
    // El próximo año exige mover también los períodos.
    expect(
      ColegioOnboardingSchema.safeParse({
        ...COLEGIO,
        anioLectivo: ANIO + 1,
        periodos: [
          {
            numero: 1,
            nombre: 'Período 1',
            fechaInicio: `${ANIO + 1}-02-02`,
            fechaFin: `${ANIO + 1}-04-24`,
          },
          {
            numero: 2,
            nombre: 'Período 2',
            fechaInicio: `${ANIO + 1}-04-28`,
            fechaFin: `${ANIO + 1}-07-03`,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('acepta un calendario B que cruza al año siguiente', () => {
    const r = ColegioOnboardingSchema.safeParse({
      ...COLEGIO,
      calendario: 'B',
      anioLectivo: ANIO - 1,
      periodos: [
        {
          numero: 1,
          nombre: 'Período 1',
          fechaInicio: `${ANIO - 1}-09-07`,
          fechaFin: `${ANIO - 1}-11-28`,
        },
        { numero: 2, nombre: 'Período 2', fechaInicio: `${ANIO}-02-01`, fechaFin: `${ANIO}-06-15` },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza períodos fuera del año lectivo, invertidos o solapados', () => {
    const antes = ColegioOnboardingSchema.safeParse({
      ...COLEGIO,
      periodos: [
        {
          numero: 1,
          nombre: 'Período 1',
          fechaInicio: `${ANIO - 1}-02-02`,
          fechaFin: fecha(4, 24),
        },
        COLEGIO.periodos[1]!,
      ],
    });
    expect(antes.success).toBe(false);
    expect(
      antes.error?.issues.some((i) => /no puede empezar antes del año lectivo/.test(i.message)),
    ).toBe(true);

    const solapado = ColegioOnboardingSchema.safeParse({
      ...COLEGIO,
      periodos: [
        COLEGIO.periodos[0]!,
        { numero: 2, nombre: 'Período 2', fechaInicio: fecha(4, 1), fechaFin: fecha(7, 3) },
      ],
    });
    expect(solapado.success).toBe(false);
    expect(solapado.error?.issues.some((i) => /se cruza con el anterior/.test(i.message))).toBe(
      true,
    );

    const invertido = ColegioOnboardingSchema.safeParse({
      ...COLEGIO,
      periodos: [
        { numero: 1, nombre: 'Período 1', fechaInicio: fecha(4, 24), fechaFin: fecha(2, 2) },
        COLEGIO.periodos[1]!,
      ],
    });
    expect(invertido.success).toBe(false);
    expect(invertido.error?.issues.some((i) => /anterior al fin/.test(i.message))).toBe(true);
  });
});
