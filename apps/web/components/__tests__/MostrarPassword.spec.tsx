/** Tests del botón mostrar/ocultar contraseña (slot trailing del TextField). */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MostrarPassword } from '../MostrarPassword';

describe('MostrarPassword', () => {
  it('ofrece mostrar la contraseña y notifica el clic', async () => {
    const onToggle = vi.fn();
    render(<MostrarPassword visible={false} onToggle={onToggle} />);

    const boton = screen.getByRole('button', { name: 'Mostrar contraseña' });
    expect(boton).toHaveAttribute('type', 'button');
    expect(boton).toHaveTextContent('visibility');

    await userEvent.click(boton);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('cuando la contraseña se ve, el botón pasa a ocultarla', async () => {
    const onToggle = vi.fn();
    render(<MostrarPassword visible onToggle={onToggle} />);

    const boton = screen.getByRole('button', { name: 'Ocultar contraseña' });
    expect(boton).toHaveTextContent('visibility_off');

    await userEvent.click(boton);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('acepta una etiqueta propia para distinguir campos de la misma pantalla', () => {
    render(
      <MostrarPassword visible={false} onToggle={() => {}} etiqueta="confirmación de contraseña" />,
    );
    expect(
      screen.getByRole('button', { name: 'Mostrar confirmación de contraseña' }),
    ).toBeInTheDocument();
  });
});
