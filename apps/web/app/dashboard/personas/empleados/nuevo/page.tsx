'use client';

/**
 * Personas → Nuevo empleado — réplica del frame «Personas · Nuevo empleado».
 *
 * Dos columnas: datos personales con rol y alcance (izquierda 712) y la vista
 * previa de permisos del rol elegido (derecha 360). La contraseña temporal se
 * muestra UNA sola vez tras crear la cuenta.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PersonasHeader } from '@/components/personas/PersonasHeader';
import { useRoles, useSedes } from '@/hooks/usePersonas';
import { useCatalogoPermisos, useCrearUsuario } from '@/hooks/useUsuarios';
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
  const { data: catalogo } = useCatalogoPermisos();
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
  const rolElegido = rolesEmpleado.find((rol) => rol.id === rolId);

  /** Nombres legibles de los permisos del rol elegido. */
  const permisosDelRol = useMemo(() => {
    if (rolElegido === undefined) return [];
    const porCodigo = new Map((catalogo ?? []).map((item) => [item.codigo, item.nombre]));
    return rolElegido.permisos.map((codigo) => porCodigo.get(codigo) ?? codigo);
  }, [rolElegido, catalogo]);

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
      <div className="per-bloque">
        <PersonasHeader
          titulo="Cuenta creada"
          subtitulo={`${nombres} ${apellidos} ya puede entrar con su contraseña temporal`}
          volver={{ href: '/dashboard/personas/empleados', texto: 'Volver a Empleados' }}
        />
        <p className="per-nota">
          Contraseña temporal: <strong>{password}</strong> — se muestra una sola vez. La persona
          deberá cambiarla al entrar por primera vez.
        </p>
        <div className="per-acciones">
          <button
            type="button"
            className="per-btn"
            onClick={() => router.push('/dashboard/personas/empleados')}
          >
            Volver a Empleados
          </button>
          <button
            type="button"
            className="per-btn per-btn--tonal"
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
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="per-bloque">
      <PersonasHeader
        titulo="Nuevo empleado"
        subtitulo="Crea la cuenta, asigna su rol y su alcance."
        volver={{ href: '/dashboard/personas/empleados', texto: 'Volver a Empleados' }}
      />

      {error !== null ? <ErrorBanner titulo="No se pudo crear la cuenta" mensaje={error} /> : null}

      <form onSubmit={enviar} noValidate>
        <div className="per-form">
          <section className="per-card-form" aria-label="Datos personales">
            <h2>Datos personales</h2>

            <div className="per-fila">
              <div className="per-campo">
                <label htmlFor="emp-nombres">Nombres</label>
                <input
                  id="emp-nombres"
                  type="text"
                  value={nombres}
                  onChange={(evento) => setNombres(evento.target.value)}
                  autoComplete="given-name"
                  maxLength={120}
                />
              </div>
              <div className="per-campo">
                <label htmlFor="emp-apellidos">Apellidos</label>
                <input
                  id="emp-apellidos"
                  type="text"
                  value={apellidos}
                  onChange={(evento) => setApellidos(evento.target.value)}
                  autoComplete="family-name"
                  maxLength={120}
                />
              </div>
            </div>

            <div className="per-campo">
              <label htmlFor="emp-email">Correo institucional</label>
              <input
                id="emp-email"
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                autoComplete="email"
                placeholder="nombre@juanaarias.edu.co"
              />
            </div>

            <div className="per-fila">
              <div className="per-campo">
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
              <div className="per-campo">
                <label htmlFor="emp-documento">Número de documento</label>
                <input
                  id="emp-documento"
                  type="text"
                  value={numeroDocumento}
                  onChange={(evento) => setNumeroDocumento(evento.target.value)}
                  autoComplete="off"
                  maxLength={20}
                />
              </div>
            </div>

            <div className="per-campo">
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

            <span className="per-celda-fuerte">Alcance</span>
            <label className="per-opcion">
              <input
                type="radio"
                name="alcance"
                checked={alcance === 'TODAS'}
                onChange={() => setAlcance('TODAS')}
              />
              Todas las sedes (solo lo decide el admin)
            </label>
            <label className="per-opcion">
              <input
                type="radio"
                name="alcance"
                checked={alcance === 'ESPECIFICAS'}
                onChange={() => setAlcance('ESPECIFICAS')}
              />
              Sedes específicas
            </label>

            {alcance === 'ESPECIFICAS' ? (
              <div className="per-sedes" role="group" aria-label="Sedes del alcance">
                {(sedes ?? []).length === 0 ? (
                  <p className="per-celda-nota">El colegio todavía no tiene sedes registradas.</p>
                ) : (
                  (sedes ?? []).map((sede) => (
                    <button
                      key={sede.id}
                      type="button"
                      className={`per-chip${sedesIds.includes(sede.id) ? ' per-chip--activo' : ''}`}
                      aria-pressed={sedesIds.includes(sede.id)}
                      onClick={() => alternarSede(sede.id)}
                    >
                      {sede.nombre}
                      {sedesIds.includes(sede.id) ? (
                        <span className="material-symbols-outlined" aria-hidden="true">
                          check
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}

            <p className="per-nota">
              Un coordinador con alcance en una sede no verá notas, asistencia ni estudiantes de
              otra sede.
            </p>
          </section>

          <aside className="per-card-form" aria-label="Permisos del rol">
            <h2>Permisos del rol</h2>
            <p>
              {rolElegido === undefined
                ? 'Elige un rol para ver sus permisos'
                : `${rolElegido.nombre} · ${rolElegido.permisos.length} permisos`}
            </p>

            {permisosDelRol.length === 0 ? (
              <p>Sin permisos todavía.</p>
            ) : (
              <div className="per-permisos">
                {permisosDelRol.map((texto) => (
                  <span key={texto} className="per-permiso per-permiso--bloqueado">
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>
                      check_box
                    </span>
                    {texto}
                  </span>
                ))}
              </div>
            )}

            {rolElegido !== undefined ? (
              <button
                type="button"
                className="per-enlace"
                onClick={() => router.push(`/dashboard/personas/roles/${rolElegido.id}`)}
              >
                Editar rol
              </button>
            ) : null}
          </aside>
        </div>

        <p className="per-nota" style={{ marginTop: 24 }}>
          Se generará una contraseña temporal de 12 caracteres. La persona deberá cambiarla al
          entrar por primera vez.
        </p>

        <div className="per-acciones" style={{ marginTop: 16 }}>
          <button type="submit" className="per-btn" disabled={crear.isPending}>
            {crear.isPending ? 'Creando…' : 'Crear empleado'}
          </button>
          <button
            type="button"
            className="per-btn per-btn--tonal"
            onClick={() => router.push('/dashboard/personas/empleados')}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}