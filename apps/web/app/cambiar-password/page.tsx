'use client';

/**
 * Cambio de contraseña FORZADO (primer login) — réplica de la pantalla
 * "force" del diseño aprobado. Consume POST /auth/cambiar-password y entra
 * al dashboard. Sin sesión → /login; sin flag de forzado → /dashboard.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorBanner } from '@/components/ErrorBanner';
import { M3Button } from '@/components/M3Button';
import { MostrarPassword } from '@/components/MostrarPassword';
import { PaperBg } from '@/components/PaperBg';
import { TextField } from '@/components/TextField';
import { SESION_KEY, useSesion } from '@/hooks/useSesion';
import { ApiError, cambiarPassword } from '@/lib/api';
import { inicialesVisible, nombreVisible } from '@/lib/nombre';

interface Regla {
  id: string;
  texto: string;
  cumple: (password: string) => boolean;
}

/** Misma política que CambioPasswordSchema del API (el server revalida). */
const REGLAS: Regla[] = [
  { id: 'largo', texto: 'Mínimo 8 caracteres', cumple: (p) => p.length >= 8 },
  { id: 'mayuscula', texto: 'Una mayúscula', cumple: (p) => /[A-Z]/.test(p) },
  { id: 'minuscula', texto: 'Una minúscula', cumple: (p) => /[a-z]/.test(p) },
  { id: 'numero', texto: 'Un número', cumple: (p) => /[0-9]/.test(p) },
];

export default function CambiarPasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: sesion, isError } = useSesion();
  const [passwordNueva, setPasswordNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const [verConfirmar, setVerConfirmar] = useState(false);

  useEffect(() => {
    if (isError) {
      router.replace('/login');
      return;
    }
    if (sesion === undefined) return;
    if (sesion.tipo === 'plataforma' || !sesion.usuario.debeCambiarPassword) {
      router.replace(sesion.tipo === 'colegio' ? '/dashboard' : '/login');
    }
  }, [sesion, isError, router]);

  const onGuardar = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!REGLAS.every((r) => r.cumple(passwordNueva))) {
        setError('La contraseña no cumple la política de seguridad.');
        return;
      }
      if (passwordNueva !== confirmar) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      setError(null);
      setEnviando(true);
      setBanner(null);
      try {
        await cambiarPassword({ passwordNueva });
        // El flag debeCambiarPassword cambió: refrescar la sesión cacheada.
        await queryClient.invalidateQueries({ queryKey: SESION_KEY });
        router.replace('/dashboard');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
          return;
        }
        setBanner(err instanceof ApiError ? err.message : 'No se pudo guardar. Intenta de nuevo.');
      } finally {
        setEnviando(false);
      }
    },
    [passwordNueva, confirmar, router, queryClient],
  );

  const sesionColegio = sesion !== undefined && sesion.tipo === 'colegio' ? sesion : null;

  return (
    <>
      <PaperBg />
      <main className="stage" id="contenido-principal">
        <div className="stage-card fade">
          {sesionColegio === null ? (
            <p className="m3-body-medium">Verificando sesión…</p>
          ) : (
            <>
              <ErrorBanner
                tono="aviso"
                icono="priority_high"
                titulo="Debes cambiar tu contraseña"
                mensaje="Por seguridad, te pedimos que la actualices antes de continuar."
              />

              <div className="dashboard-header">
                <div className="avatar-circle" aria-hidden="true">
                  {inicialesVisible(sesionColegio.usuario)}
                </div>
                <div>
                  <p className="m3-title-medium" style={{ margin: 0 }}>
                    {nombreVisible(sesionColegio.usuario)}
                  </p>
                  <p
                    className="m3-body-small"
                    style={{ color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}
                  >
                    {/* El colegio puede estar sin nombre (alta manual): se cae al genérico. */}
                    {sesionColegio.colegio.nombre.trim() === ''
                      ? 'EduPlatform'
                      : sesionColegio.colegio.nombre}
                  </p>
                </div>
              </div>

              {banner !== null ? (
                <ErrorBanner titulo="No se pudo guardar" mensaje={banner} />
              ) : null}

              <form onSubmit={onGuardar} className="login-form" noValidate>
                <div>
                  <TextField
                    id="password-nueva"
                    label="Nueva contraseña"
                    tipo={verNueva ? 'text' : 'password'}
                    value={passwordNueva}
                    onChange={(v) => {
                      setPasswordNueva(v);
                      setError(null);
                    }}
                    autoComplete="new-password"
                    autoFocus
                    trailing={
                      <MostrarPassword visible={verNueva} onToggle={() => setVerNueva((v) => !v)} />
                    }
                  />
                  <div className="reglas-lista" aria-live="polite">
                    {REGLAS.map((regla) => {
                      const cumplida = regla.cumple(passwordNueva);
                      return (
                        <span
                          key={regla.id}
                          className={`m3-body-small regla${cumplida ? ' cumplida' : ''}`}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden="true"
                            style={{ fontSize: 16 }}
                          >
                            {cumplida ? 'check_circle' : 'circle'}
                          </span>
                          {regla.texto}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <TextField
                  id="password-confirmar"
                  label="Confirmar contraseña"
                  tipo={verConfirmar ? 'text' : 'password'}
                  value={confirmar}
                  onChange={(v) => {
                    setConfirmar(v);
                    setError(null);
                  }}
                  autoComplete="new-password"
                  error={error}
                  trailing={
                    <MostrarPassword
                      visible={verConfirmar}
                      onToggle={() => setVerConfirmar((v) => !v)}
                      etiqueta="confirmación de contraseña"
                    />
                  }
                />

                <M3Button type="submit" grande className="full-width" disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar y continuar'}
                </M3Button>
              </form>
            </>
          )}
        </div>
      </main>
    </>
  );
}
