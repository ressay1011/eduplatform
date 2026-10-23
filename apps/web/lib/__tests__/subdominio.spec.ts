/** Tests unitarios de la resolución de subdominio y utilidades. */
import { describe, expect, it } from 'vitest';
import { inicialesDe, resolverSubdominio } from '../subdominio';

describe('resolverSubdominio', () => {
  it('usa el override ?colegio= cuando es un subdominio válido', () => {
    expect(resolverSubdominio('localhost', 'colegio-norte')).toBe('colegio-norte');
  });

  it('ignora overrides inválidos (mayúsculas, vacío, caracteres raros)', () => {
    expect(resolverSubdominio('localhost', 'Mayus!')).toBeNull();
    expect(resolverSubdominio('localhost', '')).toBeNull();
    expect(resolverSubdominio('localhost', '-mal-')).toBeNull();
  });

  it('extrae el subdominio de colegio-x.localhost (dev)', () => {
    expect(resolverSubdominio('colegio-norte.localhost', null)).toBe('colegio-norte');
  });

  it('localhost y direcciones IP no tienen subdominio', () => {
    expect(resolverSubdominio('localhost', null)).toBeNull();
    expect(resolverSubdominio('127.0.0.1', null)).toBeNull();
  });

  it('prod: primer label no reservado en dominios de 3+ partes', () => {
    expect(resolverSubdominio('colegio-norte.app.eduplatform.co', null)).toBe('colegio-norte');
    expect(resolverSubdominio('www.app.eduplatform.co', null)).toBeNull();
    expect(resolverSubdominio('app.eduplatform.co', null)).toBeNull();
    expect(resolverSubdominio('admin.app.eduplatform.co', null)).toBeNull();
  });
});

describe('inicialesDe', () => {
  it.each([
    ['Colegio Norte', 'CN'],
    ['escuela rural', 'ER'],
    ['Uno', 'U'],
    ['   ', '?'],
  ])('"%s" → "%s"', (nombre, esperado) => {
    expect(inicialesDe(nombre)).toBe(esperado);
  });
});