/**
 * CORS con comodín de una etiqueta.
 *
 * Producción usa orígenes exactos; el entorno de pruebas necesita aceptar los
 * previews de Vercel, que cambian de URL en cada deploy. El comodín debe cubrir
 * UNA etiqueta DNS y no servir para saltar a otro dominio.
 */
import { describe, expect, it } from 'vitest';
import { origenPermitido, origenesPermitidos } from '../cors';

const PREVIEW = 'https://eduplatform-*-yasser-ariza-barrios-projects.vercel.app';

describe('origenesPermitidos', () => {
  it('parte, recorta y descarta entradas vacías', () => {
    expect(origenesPermitidos(' http://localhost:3000 , , https://a.edu.co ')).toEqual([
      'http://localhost:3000',
      'https://a.edu.co',
    ]);
  });
});

describe('origenPermitido', () => {
  const permitidos = origenesPermitidos(`http://localhost:3000,${PREVIEW}`);

  it('acepta un origen exacto de la lista', () => {
    expect(origenPermitido('http://localhost:3000', permitidos)).toBe(true);
  });

  it('rechaza un origen que no está', () => {
    expect(origenPermitido('https://eduplatform-ivory.vercel.app', permitidos)).toBe(false);
  });

  it('el comodín acepta el hash de cada deploy del mismo equipo', () => {
    expect(
      origenPermitido(
        'https://eduplatform-esjmcy3zi-yasser-ariza-barrios-projects.vercel.app',
        permitidos,
      ),
    ).toBe(true);
    expect(
      origenPermitido(
        'https://eduplatform-8x1zq2w3p-yasser-ariza-barrios-projects.vercel.app',
        permitidos,
      ),
    ).toBe(true);
  });

  it('el comodín NO cruza a otro equipo, esquema, puerto ni subdominio', () => {
    expect(
      origenPermitido('https://eduplatform-esjmcy3zi-otro-equipo.vercel.app', permitidos),
    ).toBe(false);
    expect(
      origenPermitido(
        'http://eduplatform-esjmcy3zi-yasser-ariza-barrios-projects.vercel.app',
        permitidos,
      ),
    ).toBe(false);
    expect(
      origenPermitido(
        'https://eduplatform-esjmcy3zi-yasser-ariza-barrios-projects.vercel.app:8443',
        permitidos,
      ),
    ).toBe(false);
    expect(
      origenPermitido(
        'https://x.eduplatform-esjmcy3zi-yasser-ariza-barrios-projects.vercel.app',
        permitidos,
      ),
    ).toBe(false);
    expect(
      origenPermitido(
        'https://eduplatform-a.b-yasser-ariza-barrios-projects.vercel.app',
        permitidos,
      ),
    ).toBe(false);
  });

  it('una lista vacía no permite nada', () => {
    expect(origenPermitido('http://localhost:3000', origenesPermitidos(''))).toBe(false);
  });
});
