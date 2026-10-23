/**
 * Tests de los esquemas Zod de autenticación.
 * AAA + casos límite: formato de correo, longitud de contraseña y
 * reglas del subdominio (DNS-safe).
 */

import { describe, it, expect } from 'vitest';
import {
  LoginRequestSchema,
  SubdominioSchema,
  CambioPasswordSchema,
  PlataformaLoginRequestSchema,
} from '../index';

describe('LoginRequestSchema', () => {
  it('acepta un login válido y aplica rememberMe=false por defecto', () => {
    const r = LoginRequestSchema.safeParse({ email: 'a@b.edu.co', password: 'segura123' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rememberMe).toBe(false);
  });

  it('rechaza email inválido', () => {
    const r = LoginRequestSchema.safeParse({ email: 'no-es-email', password: 'segura123' });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseña de menos de 8 caracteres', () => {
    const r = LoginRequestSchema.safeParse({ email: 'a@b.edu.co', password: 'corta' });
    expect(r.success).toBe(false);
  });
});

describe('SubdominioSchema', () => {
  it.each(['colegio-norte', 'demo', 'ie-juana-arias', 'a1b'])('acepta "%s"', (s) => {
    expect(SubdominioSchema.safeParse(s).success).toBe(true);
  });

  it.each([
    ['Ab', 'mayúsculas'],
    ['-escuela', 'empieza en guion'],
    ['escuela-', 'termina en guion'],
    ['a'.repeat(33), 'demasiado largo'],
    ['con espacios', 'espacios'],
  ])('rechaza "%s" (%s)', (s) => {
    expect(SubdominioSchema.safeParse(s).success).toBe(false);
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