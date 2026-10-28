import { describe, expect, it } from 'vitest';
import { inicialesVisible, nombreVisible } from '../nombre';

describe('nombreVisible', () => {
  it('usa nombres y apellidos cuando existen', () => {
    expect(nombreVisible({ usuario: 'ana@colegio', nombres: 'Ana', apellidos: 'Pérez' })).toBe(
      'Ana Pérez',
    );
  });

  it('cae al usuario si los datos personales son null', () => {
    expect(nombreVisible({ usuario: 'ana@colegio', nombres: null, apellidos: null })).toBe(
      'ana@colegio',
    );
  });

  it('ignora los vacíos y los espacios', () => {
    expect(nombreVisible({ usuario: 'ana@colegio', nombres: '  ', apellidos: 'Pérez' })).toBe(
      'Pérez',
    );
  });
});

describe('inicialesVisible', () => {
  it('toma las iniciales de dos palabras', () => {
    expect(inicialesVisible({ usuario: 'ana@colegio', nombres: 'Ana', apellidos: 'Pérez' })).toBe(
      'AP',
    );
  });

  it('sin datos personales usa el inicio del usuario', () => {
    expect(inicialesVisible({ usuario: 'rector.garcia@juanaarias' })).toBe('RE');
  });

  it('nunca devuelve vacío', () => {
    expect(inicialesVisible({ usuario: '' })).toBe('?');
  });
});
