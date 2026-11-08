/**
 * Tests de los esquemas Zod de autenticación.
 * AAA + casos límite: formato de correo, longitud de contraseña y
 * reglas del subdominio (DNS-safe).
 */

import { describe, it, expect } from 'vitest';
import {
  LoginRequestSchema,
  CambioPasswordSchema,
  PlataformaLoginRequestSchema,
  CodigoColegioSchema,
  UsuarioSchema,
  sufijoDeUsuario,
} from '../index';

describe('LoginRequestSchema', () => {
  it('acepta un login válido y aplica rememberMe=false por defecto', () => {
    const r = LoginRequestSchema.safeParse({
      usuario: 'admin@juanaarias',
      password: 'segura123',
      subdominio: 'juanaarias',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rememberMe).toBe(false);
  });

  it('rechaza un nombre de usuario inválido', () => {
    const r = LoginRequestSchema.safeParse({ usuario: 'ab', password: 'segura123' });
    expect(r.success).toBe(false);
  });

  it('conserva la caja del usuario y recorta espacios', () => {
    const r = LoginRequestSchema.safeParse({ usuario: '  Admin@Juana  ', password: 'segura123' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.usuario).toBe('Admin@Juana');
  });

  it('el sufijo del usuario (el código del colegio) se lee en minúsculas', () => {
    expect(sufijoDeUsuario('Admin@JuanaArias')).toBe('juanaarias');
    expect(sufijoDeUsuario('admin@juanaArias')).toBe('juanaarias');
  });

  it('rechaza contraseña de menos de 8 caracteres', () => {
    const r = LoginRequestSchema.safeParse({ usuario: 'admin@juana', password: 'corta' });
    expect(r.success).toBe(false);
  });
});

describe('CambioPasswordSchema', () => {
  it('acepta una contraseña con mayúscula, minúscula y número', () => {
    const r = CambioPasswordSchema.safeParse({ passwordNueva: 'Segura123' });
    expect(r.success).toBe(true);
  });

  it.each([
    ['todominusculas1', 'sin mayúscula'],
    ['TODOMAYUSCULAS1', 'sin minúscula'],
    ['SinNumeros', 'sin número'],
    ['Ab1', 'demasiado corta'],
  ])('rechaza "%s" (%s)', (passwordNueva) => {
    expect(CambioPasswordSchema.safeParse({ passwordNueva }).success).toBe(false);
  });
});

describe('PlataformaLoginRequestSchema', () => {
  it('acepta credenciales válidas en el shape mínimo', () => {
    const r = PlataformaLoginRequestSchema.safeParse({
      email: 'admin@eduplatform.co',
      password: 'x',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza campos extra en el body (.strict)', () => {
    const r = PlataformaLoginRequestSchema.safeParse({
      email: 'admin@eduplatform.co',
      password: 'x',
      rol: 'SUPER_ADMIN',
    });
    expect(r.success).toBe(false);
  });

  it.each([
    [{ email: 'no-es-email', password: 'x' }, 'email inválido'],
    [{ email: 'a@b.co', password: '' }, 'password vacía'],
  ])('rechaza %j (%s)', (payload) => {
    expect(PlataformaLoginRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe('ñ en el identificador y en el código', () => {
  it('acepta la ñ en el usuario y en el código del colegio', () => {
    expect(UsuarioSchema.safeParse('muñoz@juanaarias').success).toBe(true);
    expect(UsuarioSchema.safeParse('peña').success).toBe(true);
    expect(CodigoColegioSchema.safeParse('peña').success).toBe(true);
    expect(CodigoColegioSchema.safeParse('PEÑA').success).toBe(true);
  });

  it('sigue rechazando lo que no son letras, números, puntos o guiones', () => {
    expect(UsuarioSchema.safeParse('muñoz!@juanaarias').success).toBe(false);
    expect(CodigoColegioSchema.safeParse('-peña-').success).toBe(false);
    expect(CodigoColegioSchema.safeParse('colegio.edu').success).toBe(false);
  });

  it('el sufijo con ñ vuelve en minúsculas y el login lo acepta', () => {
    expect(sufijoDeUsuario('mmuñoz@PEÑA')).toBe('peña');
    expect(
      LoginRequestSchema.safeParse({ usuario: 'mmuñoz@PEÑA', password: 'Clave1234!' }).success,
    ).toBe(true);
  });
});

describe('sufijoDeUsuario', () => {
  it('devuelve el colegio de un usuario sin TLD', () => {
    expect(sufijoDeUsuario('admin@juanaarias')).toBe('juanaarias');
    expect(sufijoDeUsuario('  Rector.Garcia@Colegio-Norte  ')).toBe('colegio-norte');
  });

  it('ignora correos reales (el sufijo lleva puntos)', () => {
    expect(sufijoDeUsuario('admin@colegio.edu.co')).toBeNull();
    expect(sufijoDeUsuario('alguien@gmail.com')).toBeNull();
  });

  it('devuelve null sin @ o con sufijo inválido', () => {
    expect(sufijoDeUsuario('rector.garcia')).toBeNull();
    expect(sufijoDeUsuario('@colegio')).toBeNull();
    expect(sufijoDeUsuario('admin@')).toBeNull();
    expect(sufijoDeUsuario('admin@-mal-')).toBeNull();
  });
});
