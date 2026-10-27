'use client';

/**
 * LoginFlow — ÚNICO punto de entrada para todos los colegios.
 *
 * Paso 1: el correo. La API deduce el colegio por el dominio (lo que va
 * después de la @) y devuelve su branding. El resultado se guarda en la
 * caché de TanStack Query: si el colegio cambia su color, `invalidateQueries`
 * lo refresca de inmediato (sin esperar TTL ni ventanas de 60s).
 * Paso 2: contraseña. La API emite la cookie httpOnly con la sesión.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { dominioDeEmail } from '@eduplatform/types';
import { BrandHeader } from '@/components/BrandHeader';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { MostrarPassword } from '@/components/MostrarPassword';
import { PaperBg } from '@/components/PaperBg';
import { StepDots } from '@/components/StepDots';
import { TextField } from '@/components/TextField';
import { SESION_KEY } from '@/hooks/useSesion';
import { ApiError, getContextoPorDominio, iniciarSesion, type ContextoConSede } from '@/lib/api';
import { aplicarBranding } from '@/lib/branding';
import { inicialesDe } from '@/lib/subdominio';
import { esEmailValido } from '@/lib/validacion';

/** Clave de caché del contexto: por dominio, la llave del login unificado. */
function claveContexto(dominio: string) {
  return ['contexto-colegio', dominio] as const;
}

export function LoginFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [paso, setPaso] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [colegio, setColegio] = useState<ContextoConSede | null>(null);
  const [recordarme, setRecordarme] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [errorEmail, setErrorEmail] = useState<string | null>(null);
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
    document.getElementById('email')?.focus();
  }, []);

  /**
   * Paso 1: valida el correo y resuelve el colegio por su dominio.
   * `fetchQuery` deduplica y respeta la caché (5 min); al invalidarla, la
   * próxima identificación vuelve a consultar la API.
   */
  const onEnviarPaso1 = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const valor = email.trim().toLowerCase();
      if (valor === '') {
        setErrorEmail('Ingresa tu correo institucional.');
        return;
      }
      if (!esEmailValido(valor)) {
        setErrorEmail('Formato de correo inválido.');
        return;
      }
      const dominio = dominioDeEmail(valor);
      if (dominio === null) {
        setErrorEmail('Formato de correo inválido.');
        return;
      }

      setErrorEmail(null);
      setBanner(null);
      setIdentificando(true);
      try {
        const contexto = await queryClient.fetchQuery({
          queryKey: claveContexto(dominio),
          queryFn: () => getContextoPorDominio(dominio),
          staleTime: 5 * 60_000,
          // Un 404 (dominio sin colegio) no se reintenta: no es transitorio.
          retry: false,
        });
        aplicarBranding(contexto.primaryColor);
        setColegio(contexto);
        setPaso(2);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setErrorEmail('Este correo no pertenece a ningún colegio registrado.');
        } else if (err instanceof ApiError) {
          setBanner(err.message);
        } else {
          setBanner('No pudimos verificar tu colegio. Intenta de nuevo.');
        }
      } finally {
        setIdentificando(false);
      }
    },
    [email, queryClient],
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
          email: email.trim().toLowerCase(),
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
          setErrorPassword('Correo o contraseña incorrectos.');
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
    [password, email, recordarme, router, queryClient],
  );

  const iniciales = colegio !== null ? inicialesDe(colegio.nombre) : 'EP';

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
                nombre={colegio !== null ? colegio.nombre : 'EduPlatform'}
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
                    Ingresa con tu correo institucional.
                  </p>

                  {banner !== null ? (
                    <ErrorBanner titulo="No pudimos iniciar sesión" mensaje={banner} />
                  ) : null}

                  <form onSubmit={onEnviarPaso1} className="login-form" noValidate>
                    <TextField
                      id="email"
                      label="Correo electrónico"
                      tipo="email"
                      value={email}
                      onChange={(v) => {
                        setEmail(v);
                        if (errorEmail !== null) setErrorEmail(null);
                      }}
                      autoComplete="username"
                      error={errorEmail}
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
                    Cambiar correo
                  </M3Button>
                  <h2 id="paso2-titulo" className="m3-headline-small step-titulo">
                    Tu contraseña
                  </h2>
                  <p className="m3-body-medium step-subtitulo">
                    Estás entrando como{' '}
                    <strong className="strong-on-surface">{email.trim()}</strong>
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
                      type="email"
                      name="username"
                      autoComplete="username"
                      value={email.trim().toLowerCase()}
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
