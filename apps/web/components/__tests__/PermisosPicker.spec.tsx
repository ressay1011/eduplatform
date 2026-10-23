/** Tests del selector de permisos (agrupado por módulo). */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PermisoCatalogoItem } from '@eduplatform/types';
import { PermisosPicker } from '../usuarios/PermisosPicker';

const catalogo: PermisoCatalogoItem[] = [
  { codigo: 'usuarios.ver', nombre: 'Ver usuarios', modulo: 'usuarios' },
  { codigo: 'usuarios.crear', nombre: 'Crear usuarios', modulo: 'usuarios' },
  { codigo: 'calificaciones.editar', nombre: 'Registrar calificaciones', modulo: 'calificaciones' },
];

describe('PermisosPicker', () => {
  it('marca y desmarca un permiso individual', async () => {
    const onChange = vi.fn();
    render(<PermisosPicker catalogo={catalogo} seleccionados={[]} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText(/Ver usuarios/));
    expect(onChange).toHaveBeenCalledWith(['usuarios.ver']);
  });

  it('"Marcar todos" agrega solo los permisos del módulo', async () => {
    const onChange = vi.fn();
    render(<PermisosPicker catalogo={catalogo} seleccionados={[]} onChange={onChange} />);

    // El primer grupo (calificaciones) tiene su propio botón.
    const botones = screen.getAllByRole('button', { name: /marcar todos/i });
    await userEvent.click(botones[0] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(['calificaciones.editar']);
  });

  it('muestra el estado marcado según la selección', () => {
    render(
      <PermisosPicker catalogo={catalogo} seleccionados={['usuarios.ver']} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/Ver usuarios/)).toBeChecked();
    expect(screen.getByLabelText(/Crear usuarios/)).not.toBeChecked();
  });
});