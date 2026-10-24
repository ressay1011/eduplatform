/** Tests del TextField M3 (label, error accesible y slot trailing). */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextField } from '../TextField';

describe('TextField', () => {
  it('renderiza el label flotante y propaga los cambios', async () => {
    const onChange = vi.fn();
    render(
      <TextField id="email" label="Correo electrónico" value="" onChange={onChange} tipo="email" />,
    );
    const input = screen.getByLabelText(/^correo electrónico/i);
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('muestra el error con role=alert y aria-invalid', () => {
    render(
      <TextField
        id="email"
        label="Correo"
        value="x"
        onChange={() => {}}
        error="Formato de correo inválido."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Formato de correo inválido.');
    expect(screen.getByLabelText(/^correo/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('renderiza el slot trailing (botón mostrar/ocultar contraseña)', () => {
    render(
      <TextField
        id="pass"
        label="Contraseña"
        value="secreta"
        onChange={() => {}}
        tipo="password"
        trailing={
          <button type="button" aria-label="Mostrar contraseña">
            ojo
          </button>
        }
      />,
    );
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument();
  });
});
