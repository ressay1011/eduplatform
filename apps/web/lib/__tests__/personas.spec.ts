/** Utilidades puras del módulo Personas. */
import { describe, expect, it } from 'vitest';
import type { PermisoCatalogoItem } from '@eduplatform/types';
import { agruparPermisos, iniciales, nombreModulo, textoAlcance } from '../personas';

const CATALOGO: PermisoCatalogoItem[] = [
  { codigo: 'usuarios.ver', nombre: 'Ver usuarios', modulo: 'usuarios' },
  { codigo: 'usuarios.crear', nombre: 'Crear usuarios', modulo: 'usuarios' },
  { codigo: 'calificaciones.editar', nombre: 'Registrar notas', modulo: 'calificaciones' },
];

describe('agruparPermisos', () => {
  it('agrupa por módulo respetando el orden del catálogo', () => {
    const grupos = agruparPermisos(CATALOGO);
    expect(grupos.map((grupo) => grupo.modulo)).toEqual(['usuarios', 'calificaciones']);
    expect(grupos[0]?.permisos).toHaveLength(2);
  });

  it('con catálogo vacío devuelve lista vacía', () => {
    expect(agruparPermisos([])).toEqual([]);
  });
});

describe('nombreModulo', () => {
  it('traduce los módulos conocidos y deja el resto igual', () => {
    expect(nombreModulo('usuarios')).toBe('Personas');
    expect(nombreModulo('otro')).toBe('otro');
  });
});

describe('textoAlcance', () => {
  it('resume el alcance por sede', () => {
    expect(textoAlcance('TODAS', [])).toBe('Todas');
    expect(textoAlcance('ESPECIFICAS', [])).toBe('Sin sede asignada');
    expect(textoAlcance('ESPECIFICAS', ['Sede A', 'Sede B'])).toBe('Sede A, Sede B');
  });
});

describe('iniciales', () => {
  it('toma la primera letra de nombres y apellidos', () => {
    expect(iniciales('ana maría', 'gómez')).toBe('AG');
  });
});