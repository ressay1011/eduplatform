'use client';

/**
 * LoginFlow — ÚNICO punto de entrada para todos los colegios.
 *
 * Paso 1: el usuario. El colegio sale de lo que va después de la `@`
 * (`admin@juanaarias`): la API resuelve su contexto público y se aplican su
 * logo y colores antes de pedir la contraseña. El resultado se guarda en la
 * caché de TanStack Query: si el colegio cambia su color, `invalidateQueries`
 * lo refresca de inmediato (sin esperar TTL ni ventanas de 60s).
 * Paso 2: contraseña. La API emite la cookie httpOnly con la sesión.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { sufijoDeUsuario } from '@eduplatform/types';
import { BrandHeader } from '@/components/BrandHeader';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { MostrarPassword } from '@/components/MostrarPassword';
import { PaperBg } from '@/components/PaperBg';
import { StepDots } from '@/components/StepDots';
import { TextField } from '@/components/TextField';
import { SESION_KEY } from '@/hooks/useSesion';
import { ApiError, getContextoColegio, iniciarSesion, type ContextoConSede } from '@/lib/api';
import { aplicarBranding } from '@/lib/branding';
import { inicialesDe } from '@/lib/iniciales';
import { esUsuarioValido } from '@/lib/validacion';

/** Clave de caché del contexto público por código de colegio. */
function claveCodigo(codigo: string) {
  return ['contexto-colegio', `cod:${codigo.toLowerCase()}`] as const;
}

export function LoginFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [paso, setPaso] = useState<1 | 2>(1);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [colegio, setColegio] = useState<ContextoConSede | null>(null);
  const [recordarme, setRecordarme] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [errorUsuario, setErrorUsuario] = useState<string | null>(null);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  /** Aviso informativo de recuperación (no es un error de login). */
  const [avisoRecuperacion, setAvisoRecuperacion] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);
  const [identificando, setIdentificando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Foco inicial en el correo: el login es de una sola entrada, así que el
  // usuario puede empezar a escribir sin hacer clic (y los lectores de
  // pantalla anuncian el campo). `autoFocus` de React no siempre se aplica
  // tras la hidratación; el efecto es determinista.
  useEffect(() => {
    document.getElementById('usuario')?.focus();
  }, []);

  /**
   * Paso 1: valida el nombre de usuario y resuelve su colegio por el sufijo
   * (`admin@juanaarias` → `juanaarias`), aplicando el branding antes del paso 2.
   */
  const onEnviarPaso1 = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const valor = usuario.trim().toLowerCase();
      if (valor === '') {
        setErrorUsuario('Ingresa tu nombre de usuario.');
        return;
      }
      if (!esUsuarioValido(valor)) {
        setErrorUsuario('Usuario inválido.');
        return;
      }

      setErrorUsuario(null);
      setBanner(null);

      // El colegio sale del propio usuario:
      // `admin@juanaArias` → colegio `juanaArias`.
      const sufijo = sufijoDeUsuario(valor);
      if (sufijo === null) {
        setErrorUsuario('Escribe tu usuario con el colegio: por ejemplo admin@juanaarias.');
        return;
      }

      setIdentificando(true);
      try {
        const contexto = await queryClient.fetchQuery({
          queryKey: claveCodigo(sufijo),
          queryFn: () => getContextoColegio(sufijo),
          staleTime: 5 * 60_000,
          // Un 404 (código sin colegio) no se reintenta: no es transitorio.
          retry: false,
        });
        aplicarBranding(contexto.primaryColor);
        setColegio(contexto);
        setPaso(2);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setErrorUsuario('No encontramos ningún colegio para ese usuario.');
        } else if (err instanceof ApiError) {
          setBanner(err.message);
        } else {
          setBanner('No pudimos verificar tu colegio. Intenta de nuevo.');
        }
      } finally {
        setIdentificando(false);
      }
    },
    [usuario, queryClient],
  );

  const onEnviarPaso2 = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (password === '') {
        setErrorPassword('Ingresa tu contraseña.');
        return;
      }
      // La política del API exige 8+ caracteres: validarlo aquí evita un 400
      // de validación (y el ruido de "Failed to load resource" en consola).
      if (password.length < 8) {
        setErrorPassword('La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      setEnviando(true);
      setBanner(null);
      setAvisoRecuperacion(false);
      try {
        const respuesta = await iniciarSesion({
          usuario: usuario.trim(),
          password,
          rememberMe: recordarme,
        });
        // La sesión cambió: /me debe leerse fresco en el dashboard.
        await queryClient.invalidateQueries({ queryKey: SESION_KEY });
        router.push(respuesta.usuario.debeCambiarPassword ? '/cambiar-password' : '/dashboard');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ACCOUNT_LOCKED') {
          setBloqueada(true);
        } else if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
          setErrorPassword('Usuario o contraseña incorrectos.');
        } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
          // Defensa extra: si el contrato cambia, se muestra en el campo.
          setErrorPassword('Revisa la contraseña e intenta de nuevo.');
        } else if (err instanceof ApiError) {
          setBanner(err.message);
        } else {
          setBanner('Ocurrió un error inesperado. Intenta de nuevo.');
        }
      } finally {
        setEnviando(false);
      }
    },
    [password, usuario, recordarme, router, queryClient],
  );

  // Un colegio recién entregado aún no tiene nombre: hasta que lo tenga, el
  // login se presenta como EduPlatform para no dejar la cabecera vacía.
  const nombreColegio = colegio?.nombre.trim() ?? '';
  const nombreVisible = nombreColegio === '' ? 'EduPlatform' : nombreColegio;
  const iniciales = nombreColegio === '' ? 'EP' : inicialesDe(nombreColegio);

  return (
    <>
      <PaperBg />
      <main className="stage" id="contenido-principal">
        <div className="stage-card fade">
          {bloqueada ? (
            <section aria-labelledby="bloqueada-titulo" className="locked-card">
              <div className="locked-icon" aria-hidden="true">
                <span className="material-symbols-outlined">lock</span>
              </div>
              <h2
                id="bloqueada-titulo"
                className="m3-headline-small"
                style={{ margin: '0 0 8px 0' }}
              >
                Cuenta bloqueada
              </h2>
              <p
                className="m3-body-medium"
                style={{ color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 24px 0' }}
              >
                Por seguridad, bloqueamos esta cuenta tras varios intentos fallidos.
              </p>
              <div className="locked-info">
                <p className="m3-body-medium" style={{ margin: 0 }}>
                  El bloqueo se levanta automáticamente en <strong>15 minutos</strong> o contactando
                  al admin de tu colegio.
                </p>
              </div>
              <M3Button
                grande
                className="full-width"
                onClick={() => {
                  setBloqueada(false);
                  setErrorPassword(null);
                }}
              >
                Volver
              </M3Button>
            </section>
          ) : (
            <>
              <BrandHeader
                nombre={nombreVisible}
                codigoDane={colegio !== null ? colegio.codigoDane : null}
                iniciales={iniciales}
              />

              <StepDots total={2} actual={paso} />

              {paso === 1 ? (
                <section aria-labelledby="paso1-titulo">
                  <h2 id="paso1-titulo" className="m3-headline-small step-titulo">
                    Iniciar sesión
                  </h2>
                  <p className="m3-body-medium step-subtitulo">
                    Escribe el usuario que te dio tu colegio.
                  </p>

                  {banner !== null ? (
                    <ErrorBanner titulo="No pudimos iniciar sesión" mensaje={banner} />
                  ) : null}

                  <form onSubmit={onEnviarPaso1} className="login-form" noValidate>
                    <TextField
                      id="usuario"
                      label="Nombre de usuario"
                      value={usuario}
                      onChange={(v) => {
                        setUsuario(v);
                        if (errorUsuario !== null) setErrorUsuario(null);
                      }}
                      autoComplete="username"
                      ayuda="Ejemplo: admin@juanaarias"
                      error={errorUsuario}
                      autoFocus
                    />
                    <M3Button
                      type="submit"
                      grande
                      icono="arrow_forward"
                      iconoAlFinal
                      className="full-width"
                      disabled={identificando}
                    >
                      {identificando ? 'Buscando tu colegio…' : 'Continuar'}
                    </M3Button>
                  </form>
                </section>
              ) : (
                <section aria-labelledby="paso2-titulo">
                  <M3Button
                    variante="text"
                    className="btn-volver"
                    onClick={() => {
                      setPaso(1);
                      setPassword('');
                      setErrorPassword(null);
                      // Los avisos del paso 2 no deben quedar pegados al volver.
                      setBanner(null);
                      setAvisoRecuperacion(false);
                    }}
                    icono="arrow_back"
                    type="button"
                  >
                    Cambiar usuario
                  </M3Button>
                  <h2 id="paso2-titulo" className="m3-headline-small step-titulo">
                    Tu contraseña
                  </h2>
                  <p className="m3-body-medium step-subtitulo">
                    Estás entrando como{' '}
                    <strong className="strong-on-surface">{usuario.trim()}</strong>
                  </p>

                  {banner !== null ? (
                    <ErrorBanner titulo="No pudimos iniciar sesión" mensaje={banner} />
                  ) : null}

                  {avisoRecuperacion ? (
                    <ErrorBanner
                      tono="aviso"
                      icono="info"
                      titulo="Recuperar contraseña"
                      mensaje="Para restablecer tu contraseña, contacta al admin de tu colegio."
                    />
                  ) : null}

                  <form onSubmit={onEnviarPaso2} className="login-form" noValidate>
                    {/*
                     * Campo de usuario para los gestores de contraseñas: el
                     * correo se capturó en el paso 1, pero Chrome/Dashlane
                     * exigen un campo de usuario EN EL MISMO formulario que la
                     * contraseña para poder asociarla. Va oculto y es de solo
                     * lectura (el valor lo controla el paso 1).
                     */}
                    <input
                      type="text"
                      name="username"
                      autoComplete="username"
                      value={usuario.trim().toLowerCase()}
                      readOnly
                      hidden
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <TextField
                      id="password"
                      label="Contraseña"
                      tipo={mostrarPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(v) => {
                        setPassword(v);
                        if (errorPassword !== null) setErrorPassword(null);
                      }}
                      autoComplete="current-password"
                      error={errorPassword}
                      autoFocus
                      trailing={
                        <MostrarPassword
                          visible={mostrarPassword}
                          onToggle={() => setMostrarPassword((v) => !v)}
                        />
                      }
                    />

                    <div className="fila-recordar">
                      <label className="m3-checkbox-label">
                        <input
                          type="checkbox"
                          checked={recordarme}
                          onChange={(e) => setRecordarme(e.target.checked)}
                          className="visually-hidden"
                        />
                        <span className="m3-checkbox-box" aria-hidden="true">
                          <span className="material-symbols-outlined">check</span>
                        </span>
                        <span className="m3-body-medium">Mantener sesión</span>
                      </label>
                      <M3Button
                        variante="text"
                        type="button"
                        className="btn-olvide"
                        onClick={() => {
                          // Mientras no exista el envío de correos de recuperación,
                          // el camino es el admin del colegio (sin ruta de UI aún).
                          setAvisoRecuperacion(true);
                        }}
                      >
                        ¿Olvidaste?
                      </M3Button>
                    </div>

                    <M3Button type="submit" grande className="full-width" disabled={enviando}>
                      {enviando ? 'Ingresando…' : 'Ingresar'}
                    </M3Button>
                  </form>
                </section>
              )}

              {colegio !== null && colegio.estado === 'SUSPENDIDO' ? (
                <ErrorBanner
                  tono="aviso"
                  icono="block"
                  titulo="Colegio suspendido"
                  mensaje="El acceso está temporalmente suspendido. Contacta a soporte."
                />
              ) : null}
            </>
          )}
        </div>
      </main>
    </>
  );
}
