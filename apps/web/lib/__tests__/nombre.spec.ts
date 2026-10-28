import { describe, expect, it } from 'vitest';
import { inicialesVisible, nombreCorto, nombreVisible } from '../nombre';

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

describe('nombreCorto', () => {
  it('usa el primer nombre y la inicial del apellido', () => {
    expect(nombreCorto({ usuario: 'ana@colegio', nombres: 'Ana María', apellidos: 'Pérez' })).toBe(
      'Ana P.',
    );
  });

  it('sin datos personales devuelve el usuario', () => {
    expect(nombreCorto({ usuario: 'admin@juanaarias' })).toBe('admin@juanaarias');
  });

  it('con un solo nombre no añade inicial', () => {
    expect(nombreCorto({ usuario: 'x@y', nombres: 'Ana', apellidos: '' })).toBe('Ana');
  });
});
