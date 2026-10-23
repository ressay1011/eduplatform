'use client';

/**
 * Personas → Nuevo empleado.
 * Crea la cuenta con rol + alcance por sede y muestra la contraseña temporal
 * UNA sola vez (en BD solo queda el hash).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { TextField } from '@/components/TextField';
import { useRoles, useSedes } from '@/hooks/usePersonas';
import { useCrearUsuario } from '@/hooks/useUsuarios';
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@eduplatform/types';

const NOMBRES_DOCUMENTO: Record<string, string> = {
  CC: 'Cédula de ciudadanía',
  TI: 'Tarjeta de identidad',
  CE: 'Cédula de extranjería',
  RC: 'Registro civil',
  PEP: 'PEP',
  PPT: 'PPT',
};

export default function NuevoEmpleadoPage() {
  const router = useRouter();
  const { data: roles } = useRoles();
  const { data: sedes } = useSedes();
  const crear = useCrearUsuario();

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('CC');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [rolId, setRolId] = useState('');
  const [alcance, setAlcance] = useState<'TODAS' | 'ESPECIFICAS'>('TODAS');
  const [sedesIds, setSedesIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  const rolesEmpleado = (roles?.items ?? []).filter(
    (rol) => rol.tipoPersona === 'EMPLEADO' && rol.activo,
  );

  const alternarSede = (id: string): void => {
    setSedesIds((actuales) =>
      actuales.includes(id) ? actuales.filter((item) => item !== id) : [...actuales, id],
    );
  };

  const enviar = (evento: React.FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    setError(null);
    if (rolId === '') {
      setError('Elige un rol para el empleado.');
      return;
    }
    if (alcance === 'ESPECIFICAS' && sedesIds.length === 0) {
      setError('Elige al menos una sede o usa «Todas las sedes».');
      return;
    }
    crear.mutate(
      {
        nombres,
        apellidos,
        email,
        tipoDocumento,
        numeroDocumento,
        esAdmin: false,
        rolId,
        alcance,
        sedesIds: alcance === 'ESPECIFICAS' ? sedesIds : [],
        permisos: [],
      },
      {
        onSuccess: (datos) => setPassword(datos.passwordTemporal),
        onError: (fallo) => setError(fallo.message),
      },
    );
  };

  if (password !== null) {
    return (
      <>
        <div className="page-topbar">
          <M3Button variante="text" icono="arrow_back" onClick={() => router.push('/dashboard/personas/empleados')}>
            Empleados
          </M3Button>
          <h2 className="m3-title-large" style={{ margin: 0 }}>
            Cuenta creada
          </h2>
        </div>
        <div className="aviso-inline">
          Contraseña temporal: <code>{password}</code>
          <br />
          Se muestra una sola vez. La persona deberá cambiarla al entrar.
        </div>
        <div className="form-acciones">
          <M3Button onClick={() => router.push('/dashboard/personas/empleados')} icono="group">
            Volver a Empleados
          </M3Button>
          <M3Button
            variante="text"
            icono="person_add"
            onClick={() => {
              setPassword(null);
              setNombres('');
              setApellidos('');
              setEmail('');
              setNumeroDocumento('');
              setRolId('');
            }}
          >
            Crear otro
          </M3Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-topbar">
        <M3Button variante="text" icono="arrow_back" onClick={() => router.push('/dashboard/personas/empleados')}>
          Empleados
        </M3Button>
        <h2 className="m3-title-large" style={{ margin: 0 }}>
          Nuevo empleado
        </h2>
      </div>

      {error !== null ? <ErrorBanner titulo="No se pudo crear la cuenta" mensaje={error} /> : null}

      <form onSubmit={enviar} noValidate>
        <div className="form-grid">
          <TextField id="emp-nombres" label="Nombres" tipo="text" value={nombres} onChange={setNombres} autoComplete="given-name" />
          <TextField id="emp-apellidos" label="Apellidos" tipo="text" value={apellidos} onChange={setApellidos} autoComplete="family-name" />
          <TextField id="emp-email" label="Correo institucional" tipo="email" value={email} onChange={setEmail} autoComplete="email" />
          <div className="campo">
            <label htmlFor="emp-tipo-doc">Tipo de documento</label>
            <select
              id="emp-tipo-doc"
              value={tipoDocumento}
              onChange={(evento) => setTipoDocumento(evento.target.value as TipoDocumento)}
            >
              {TIPOS_DOCUMENTO.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {NOMBRES_DOCUMENTO[tipo] ?? tipo}
                </option>
              ))}
            </select>
          </div>
          <TextField id="emp-documento" label="Número de documento" tipo="text" value={numeroDocumento} onChange={setNumeroDocumento} autoComplete="off" />
          <div className="campo">
            <label htmlFor="emp-rol">Rol</label>
            <select id="emp-rol" value={rolId} onChange={(evento) => setRolId(evento.target.value)}>
              <option value="">— Elige un rol —</option>
              {rolesEmpleado.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre} ({rol.permisos.length} permisos)
                </option>
              ))}
            </select>
          </div>
        </div>

        <section className="form-seccion">
          <h3>Alcance por sede</h3>
          <div className="radio-fila" role="radiogroup" aria-label="Alcance por sede">
            <label className="radio-opcion">
              <input
                type="radio"
                name="alcance"
                checked={alcance === 'TODAS'}
                onChange={() => setAlcance('TODAS')}
              />
              Todas las sedes
            </label>
            <label className="radio-opcion">
              <input
                type="radio"
                name="alcance"
                checked={alcance === 'ESPECIFICAS'}
                onChange={() => setAlcance('ESPECIFICAS')}
              />
              Sedes específicas
            </label>
          </div>

          {alcance === 'ESPECIFICAS' ? (
            <div className="permisos-lista" style={{ marginTop: 12 }}>
              {(sedes ?? []).length === 0 ? (
                <p className="m3-body-small" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                  El colegio todavía no tiene sedes registradas.
                </p>
              ) : (
                (sedes ?? []).map((sede) => (
                  <label key={sede.id} className="permiso-check">
                    <input
                      type="checkbox"
                      checked={sedesIds.includes(sede.id)}
                      onChange={() => alternarSede(sede.id)}
                    />
                    <span>{sede.nombre}</span>
                  </label>
                ))
              )}
            </div>
          ) : null}
        </section>

        <div className="form-acciones">
          <M3Button type="submit" icono="person_add" disabled={crear.isPending}>
            Crear empleado
          </M3Button>
          <M3Button variante="text" type="button" onClick={() => router.push('/dashboard/personas/empleados')}>
            Cancelar
          </M3Button>
        </div>
      </form>
    </>
  );
}