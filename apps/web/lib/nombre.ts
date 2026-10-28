/**
 * Nombre visible de una persona con datos personales opcionales.
 *
 * Los usuarios se crean solo con su credencial (`usuario` + contraseña) y los
 * datos personales se completan después, así que la UI nunca debe mostrar
 * «null»: cae al nombre de usuario.
 */
export interface ConNombre {
  usuario: string;
  nombres?: string | null;
  apellidos?: string | null;
}

/** «Nombres Apellidos» o, si están vacíos, el usuario. */
export function nombreVisible(persona: ConNombre): string {
  const partes = [persona.nombres, persona.apellidos]
    .map((parte) => (parte ?? '').trim())
    .filter((parte) => parte !== '');
  return partes.length === 0 ? persona.usuario : partes.join(' ');
}

/** Iniciales para el avatar: de los nombres o, si no hay, del usuario. */
export function inicialesVisible(persona: ConNombre): string {
  const nombre = nombreVisible(persona);
  if (nombre !== persona.usuario) {
    const palabras = nombre.split(/\s+/).filter((p) => p !== '');
    return palabras
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }
  const base = persona.usuario.split('@')[0] ?? persona.usuario;
  return base.slice(0, 2).toUpperCase() || '?';
}
