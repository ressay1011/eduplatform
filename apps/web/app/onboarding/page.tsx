'use client';

/**
 * Onboarding · configuración inicial del colegio (6 pasos).
 *
 * Réplica del diseño aprobado (`diseno/Exports/Onboarding · *.json`): rail de
 * 320 px con los pasos, contenido con título Fraunces y tarjetas M3.
 *
 * Los pasos 1-3 y 6 están conectados a la API. Los pasos 4 (personal) y 5
 * (estudiantes) se pueden omitir por ahora: el alta masiva llega con el módulo
 * de matrículas y mientras tanto se hacen desde Personas.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Jornada, type EstadoOnboarding } from '@eduplatform/types';
import { M3Button } from '@/components/M3Button';
import { TextField } from '@/components/TextField';
import {
  ApiError,
  finalizarOnboarding,
  generarEstructuraOnboarding,
  getOnboarding,
  guardarColegioOnboarding,
  guardarPasoOnboarding,
  guardarSedeOnboarding,
} from '@/lib/api';

const PASOS = [
  'Colegio',
  'Sedes y jornadas',
  'Estructura',
  'Personal',
  'Estudiantes',
  'Resumen',
] as const;

const JORNADAS: { valor: Jornada; texto: string }[] = [
  { valor: Jornada.MANANA, texto: 'Mañana' },
  { valor: Jornada.TARDE, texto: 'Tarde' },
  { valor: Jornada.NOCTURNA, texto: 'Noche' },
  { valor: Jornada.UNICA, texto: 'Única' },
  { valor: Jornada.FIN_SEMANA, texto: 'Sabatina' },
];

const NIVELES: { id: string; texto: string; grados: number[] }[] = [
  { id: 'PREESCOLAR', texto: 'Preescolar', grados: [0] },
  { id: 'PRIMARIA', texto: 'Primaria', grados: [1, 2, 3, 4, 5] },
  { id: 'BACHILLERATO', texto: 'Bachillerato', grados: [6, 7, 8, 9, 10, 11] },
];

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];

interface PeriodoForm {
  numero: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

/** Períodos típicos según calendario (editables en el paso 1). */
function periodosBase(calendario: 'A' | 'B', anio: number): PeriodoForm[] {
  const y = String(anio);
  if (calendario === 'B') {
    return [
      { numero: 1, nombre: 'Período 1', fechaInicio: `${y}-09-07`, fechaFin: `${y}-11-28` },
      {
        numero: 2,
        nombre: 'Período 2',
        fechaInicio: `${y}-12-01`,
        fechaFin: `${Number(y) + 1}-02-27`,
      },
      {
        numero: 3,
        nombre: 'Período 3',
        fechaInicio: `${Number(y) + 1}-03-02`,
        fechaFin: `${Number(y) + 1}-05-15`,
      },
      {
        numero: 4,
        nombre: 'Período 4',
        fechaInicio: `${Number(y) + 1}-05-18`,
        fechaFin: `${Number(y) + 1}-06-30`,
      },
    ];
  }
  return [
    { numero: 1, nombre: 'Período 1', fechaInicio: `${y}-02-02`, fechaFin: `${y}-04-24` },
    { numero: 2, nombre: 'Período 2', fechaInicio: `${y}-04-28`, fechaFin: `${y}-07-03` },
    { numero: 3, nombre: 'Período 3', fechaInicio: `${y}-07-21`, fechaFin: `${y}-09-25` },
    { numero: 4, nombre: 'Período 4', fechaInicio: `${y}-09-29`, fechaFin: `${y}-11-30` },
  ];
}

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<EstadoOnboarding>({
    queryKey: ['onboarding'],
    queryFn: getOnboarding,
    retry: false,
  });

  const [paso, setPaso] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Paso 1
  const [colegio, setColegio] = useState({
    nombre: '',
    nit: '',
    codigoDane: '',
    subdominio: '',
    dominioEmail: '',
    municipio: '',
    departamento: '',
    direccion: '',
    telefono: '',
    email: '',
    calendario: 'A' as 'A' | 'B',
    anioLectivo: new Date().getFullYear(),
  });
  const [periodos, setPeriodos] = useState<PeriodoForm[]>([]);

  // Paso 2
  const [sede, setSede] = useState({
    nombre: 'Sede Principal',
    direccion: '',
    jornadas: [] as Jornada[],
  });

  // Paso 3
  const [sedeId, setSedeId] = useState('');
  const [jornada, setJornada] = useState<Jornada>(Jornada.MANANA);
  const [grados, setGrados] = useState<number[]>([6, 7]);
  const [letras, setLetras] = useState<string[]>(['A', 'B']);

  useEffect(() => {
    if (data === undefined) return;
    setColegio({
      nombre: data.colegio.nombre,
      nit: data.colegio.nit ?? '',
      codigoDane: data.colegio.codigoDane,
      subdominio: data.colegio.subdominio,
      dominioEmail: data.colegio.dominioEmail ?? '',
      municipio: data.colegio.municipio,
      departamento: data.colegio.departamento,
      direccion: data.colegio.direccion ?? '',
      telefono: data.colegio.telefono ?? '',
      email: data.colegio.email,
      calendario: data.colegio.calendario,
      anioLectivo: data.anioLectivo?.anio ?? new Date().getFullYear(),
    });
    setPeriodos(
      data.periodos.length > 0
        ? data.periodos
        : periodosBase(data.colegio.calendario, new Date().getFullYear()),
    );
    setPaso(Math.min(6, Math.max(1, data.paso)));
    if (data.sedes[0] !== undefined) {
      setSedeId(data.sedes[0].id);
      setJornada(data.sedes[0].jornadas[0] ?? Jornada.MANANA);
    }
  }, [data]);

  const cursosPrevistos = useMemo(() => grados.length * letras.length, [grados, letras]);
  const sedeActual = data?.sedes.find((s) => s.id === sedeId) ?? data?.sedes[0];

  function aplicar(estado: EstadoOnboarding, siguiente?: number): void {
    qc.setQueryData(['onboarding'], estado);
    if (siguiente !== undefined) setPaso(siguiente);
    setAviso(null);
  }

  async function ejecutar(
    accion: () => Promise<EstadoOnboarding>,
    siguiente?: number,
  ): Promise<void> {
    setGuardando(true);
    setAviso(null);
    try {
      aplicar(await accion(), siguiente);
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  const mutColegio = useMutation({
    mutationFn: () =>
      guardarColegioOnboarding({
        ...colegio,
        nit: colegio.nit === '' ? undefined : colegio.nit,
        dominioEmail: colegio.dominioEmail === '' ? undefined : colegio.dominioEmail,
        direccion: colegio.direccion === '' ? undefined : colegio.direccion,
        telefono: colegio.telefono === '' ? undefined : colegio.telefono,
        periodos,
      }),
  });

  async function guardarPaso1(siguiente: number): Promise<void> {
    setGuardando(true);
    setAviso(null);
    try {
      aplicar(await mutColegio.mutateAsync(), siguiente);
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo guardar el colegio.');
    } finally {
      setGuardando(false);
    }
  }

  async function guardarPaso2(siguiente: number): Promise<void> {
    if (sede.jornadas.length === 0) {
      setAviso('Elige al menos una jornada para la sede.');
      return;
    }
    await ejecutar(
      () =>
        guardarSedeOnboarding({
          id: sedeActual?.id,
          nombre: sede.nombre,
          direccion: sede.direccion === '' ? undefined : sede.direccion,
          jornadas: sede.jornadas,
        }),
      siguiente,
    );
  }

  async function generar(siguiente: number): Promise<void> {
    if (sedeId === '') {
      setAviso('Primero guarda una sede.');
      return;
    }
    await ejecutar(
      () => generarEstructuraOnboarding({ sedeId, jornada, grados, letras }),
      siguiente,
    );
  }

  async function salir(): Promise<void> {
    try {
      const estado = await guardarPasoOnboarding(paso);
      qc.setQueryData(['onboarding'], estado);
    } finally {
      router.push('/dashboard');
    }
  }

  async function terminar(): Promise<void> {
    setGuardando(true);
    setAviso(null);
    try {
      const resultado = await finalizarOnboarding();
      qc.setQueryData(['onboarding'], resultado.estado);
      router.push('/dashboard');
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo finalizar.');
    } finally {
      setGuardando(false);
    }
  }

  if (isLoading) {
    return (
      <main className="onb-cargando" aria-live="polite">
        Cargando configuración…
      </main>
    );
  }

  if (error !== null || data === undefined) {
    return (
      <main className="onb-cargando">
        <p>No pudimos cargar la configuración del colegio.</p>
        <M3Button onClick={() => router.push('/dashboard')}>Volver al dashboard</M3Button>
      </main>
    );
  }

  return (
    <div className="onb-shell">
      <aside className="onb-rail" aria-label="Pasos de la configuración">
        <div>
          <p className="onb-marca">EduPlatform</p>
          <p className="onb-sub">Configuración inicial</p>
        </div>
        <ol className="onb-pasos">
          {PASOS.map((titulo, i) => {
            const n = i + 1;
            const estado = n === paso ? 'activo' : n < paso ? 'hecho' : 'pendiente';
            return (
              <li key={titulo} className={`onb-paso onb-paso--${estado}`}>
                <span className="onb-num">{n < paso ? '✓' : n}</span>
                <span>{titulo}</span>
              </li>
            );
          })}
        </ol>
        <button type="button" className="onb-salir" onClick={() => void salir()}>
          Guardar y salir
        </button>
      </aside>

      <main className="onb-main">
        <p className="onb-eyebrow">PASO {paso} DE 6</p>
        <h1 className="onb-titulo">{tituloDe(paso)}</h1>
        <p className="onb-bajada">{bajadaDe(paso)}</p>

        {aviso !== null && (
          <p className="onb-aviso" role="alert">
            {aviso}
          </p>
        )}

        {paso === 1 && (
          <section className="onb-card">
            <h2 className="onb-card-titulo">Identidad del colegio</h2>
            <div className="onb-grid">
              <TextField
                id="onb-nombre"
                label="Nombre"
                value={colegio.nombre}
                onChange={(v) => setColegio({ ...colegio, nombre: v })}
              />
              <TextField
                id="onb-nit"
                label="NIT (opcional)"
                value={colegio.nit}
                onChange={(v) => setColegio({ ...colegio, nit: v })}
              />
              <TextField
                id="onb-dane"
                label="Código DANE"
                value={colegio.codigoDane}
                onChange={(v) => setColegio({ ...colegio, codigoDane: v })}
              />
              <TextField
                id="onb-sub"
                label="Subdominio"
                value={colegio.subdominio}
                onChange={(v) => setColegio({ ...colegio, subdominio: v })}
              />
              <TextField
                id="onb-dominio"
                label="Dominio de correo"
                value={colegio.dominioEmail}
                onChange={(v) => setColegio({ ...colegio, dominioEmail: v })}
                ayuda="Ejemplo: juanaarias.edu.co"
              />
              <TextField
                id="onb-municipio"
                label="Municipio"
                value={colegio.municipio}
                onChange={(v) => setColegio({ ...colegio, municipio: v })}
              />
              <TextField
                id="onb-departamento"
                label="Departamento"
                value={colegio.departamento}
                onChange={(v) => setColegio({ ...colegio, departamento: v })}
              />
              <TextField
                id="onb-direccion"
                label="Dirección"
                value={colegio.direccion}
                onChange={(v) => setColegio({ ...colegio, direccion: v })}
              />
              <TextField
                id="onb-telefono"
                label="Teléfono"
                value={colegio.telefono}
                onChange={(v) => setColegio({ ...colegio, telefono: v })}
              />
              <TextField
                id="onb-email"
                label="Correo del colegio"
                tipo="email"
                value={colegio.email}
                onChange={(v) => setColegio({ ...colegio, email: v })}
              />
            </div>

            <h2 className="onb-card-titulo">Calendario escolar</h2>
            <div className="onb-opciones">
              {(['A', 'B'] as const).map((c) => (
                <label
                  key={c}
                  className={`onb-chip${colegio.calendario === c ? ' onb-chip--on' : ''}`}
                >
                  <input
                    type="radio"
                    name="calendario"
                    checked={colegio.calendario === c}
                    onChange={() => {
                      setColegio({ ...colegio, calendario: c });
                      setPeriodos(periodosBase(c, colegio.anioLectivo));
                    }}
                  />
                  Calendario {c}
                </label>
              ))}
            </div>

            <h2 className="onb-card-titulo">Año lectivo</h2>
            <div className="onb-grid onb-grid--angosto">
              <TextField
                id="onb-anio"
                label="Año"
                value={String(colegio.anioLectivo)}
                onChange={(v) => {
                  const anio = Number(v.replace(/\D/g, '').slice(0, 4)) || colegio.anioLectivo;
                  setColegio({ ...colegio, anioLectivo: anio });
                  setPeriodos(periodosBase(colegio.calendario, anio));
                }}
              />
            </div>

            <p className="onb-nota">
              Períodos académicos precargados según el calendario {colegio.calendario}. Puedes
              ajustar las fechas.
            </p>
            <div className="onb-periodos">
              {periodos.map((p, i) => (
                <div key={p.numero} className="onb-periodo">
                  <strong>{p.nombre}</strong>
                  <label>
                    Inicio
                    <input
                      type="date"
                      value={p.fechaInicio}
                      onChange={(e) => {
                        const copia = [...periodos];
                        copia[i] = { ...p, fechaInicio: e.target.value };
                        setPeriodos(copia);
                      }}
                    />
                  </label>
                  <label>
                    Fin
                    <input
                      type="date"
                      value={p.fechaFin}
                      onChange={(e) => {
                        const copia = [...periodos];
                        copia[i] = { ...p, fechaFin: e.target.value };
                        setPeriodos(copia);
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          </section>
        )}

        {paso === 2 && (
          <section className="onb-card">
            <p className="onb-nota">Cada curso pertenecerá a una sede y a una de sus jornadas.</p>
            <div className="onb-grid">
              <TextField
                id="onb-sede-nombre"
                label="Nombre de la sede"
                value={sede.nombre}
                onChange={(v) => setSede({ ...sede, nombre: v })}
              />
              <TextField
                id="onb-sede-dir"
                label="Dirección"
                value={sede.direccion}
                onChange={(v) => setSede({ ...sede, direccion: v })}
              />
            </div>
            <h2 className="onb-card-titulo">Jornadas que ofrece</h2>
            <div className="onb-opciones">
              {JORNADAS.map((j) => {
                const on = sede.jornadas.includes(j.valor);
                return (
                  <label key={j.valor} className={`onb-chip${on ? ' onb-chip--on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setSede({
                          ...sede,
                          jornadas: on
                            ? sede.jornadas.filter((x) => x !== j.valor)
                            : [...sede.jornadas, j.valor],
                        })
                      }
                    />
                    {j.texto}
                  </label>
                );
              })}
            </div>
            {data.sedes.length > 0 && (
              <p className="onb-nota">
                Ya tienes {data.sedes.length} sede(s): {data.sedes.map((s) => s.nombre).join(', ')}.
                Al guardar se actualiza {sedeActual?.nombre ?? 'la sede'}.
              </p>
            )}
          </section>
        )}

        {paso === 3 && (
          <section className="onb-card">
            <p className="onb-nota">
              Genera los cursos por sede y jornada. Podrás editarlos uno a uno después.
            </p>
            <div className="onb-grid">
              <label className="onb-campo">
                Sede
                <select value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
                  {data.sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="onb-campo">
                Jornada
                <select value={jornada} onChange={(e) => setJornada(e.target.value as Jornada)}>
                  {(sedeActual?.jornadas ?? []).map((j) => (
                    <option key={j} value={j}>
                      {JORNADAS.find((x) => x.valor === j)?.texto ?? j}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {NIVELES.map((n) => (
              <div key={n.id} className="onb-nivel">
                <label className="onb-chip onb-chip--on">
                  <input
                    type="checkbox"
                    checked={n.grados.every((g) => grados.includes(g))}
                    onChange={() =>
                      setGrados(
                        n.grados.every((g) => grados.includes(g))
                          ? grados.filter((g) => !n.grados.includes(g))
                          : [...new Set([...grados, ...n.grados])].sort((a, b) => a - b),
                      )
                    }
                  />
                  {n.texto}
                </label>
                <div className="onb-opciones">
                  {n.grados.map((g) => (
                    <label
                      key={g}
                      className={`onb-chip${grados.includes(g) ? ' onb-chip--on' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={grados.includes(g)}
                        onChange={() =>
                          setGrados(
                            grados.includes(g)
                              ? grados.filter((x) => x !== g)
                              : [...grados, g].sort((a, b) => a - b),
                          )
                        }
                      />
                      {g === 0 ? 'Transición' : `${g}°`}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <h2 className="onb-card-titulo">Grupos por grado</h2>
            <div className="onb-opciones">
              {LETRAS.map((l) => (
                <label key={l} className={`onb-chip${letras.includes(l) ? ' onb-chip--on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={letras.includes(l)}
                    onChange={() =>
                      setLetras(
                        letras.includes(l)
                          ? letras.filter((x) => x !== l)
                          : [...letras, l].sort((a, b) => a.localeCompare(b)),
                      )
                    }
                  />
                  {l}
                </label>
              ))}
            </div>
            <p className="onb-nota">
              Se crearán {cursosPrevistos} curso(s)
              {grados.length > 0 && letras.length > 0
                ? `: ${grados.map((g) => (g === 0 ? 'Transición' : `${g}°`)).join(', ')} × ${letras.join(', ')}`
                : ''}
              {sedeActual !== undefined ? ` · ${sedeActual.nombre}` : ''}.
            </p>
          </section>
        )}

        {(paso === 4 || paso === 5) && (
          <section className="onb-card onb-card--pendiente">
            <p>
              {paso === 4
                ? 'El alta de personal se hace desde Personas → Empleados (con rol y sede). La importación CSV llega con ese módulo.'
                : 'La carga masiva de estudiantes llega con el módulo de matrículas; las filas se validan contra cursos reales.'}
            </p>
            <p className="onb-nota">
              Puedes omitirlo ahora: el checklist «Completa tu colegio» te lo recordará en el
              dashboard.
            </p>
          </section>
        )}

        {paso === 6 && (
          <section className="onb-card">
            <div className="onb-resumen">
              <div>
                <strong>{data.sedes.length}</strong>
                <span>Sedes</span>
              </div>
              <div>
                <strong>{data.estructura.cursos}</strong>
                <span>Cursos</span>
              </div>
              <div>
                <strong>{data.personal.total}</strong>
                <span>Personas</span>
              </div>
              <div>
                <strong>{data.estudiantes.matriculados}</strong>
                <span>Matriculados</span>
              </div>
            </div>
            <ul className="onb-checklist">
              {data.checklist.map((c) => (
                <li key={c.clave} className={c.hecho ? 'hecho' : ''}>
                  <span aria-hidden>{c.hecho ? '✓' : '○'}</span>
                  <div>
                    <strong>{c.titulo}</strong>
                    <p>{c.detalle}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="onb-nota">
              Puedes entrar al dashboard ahora: la tarjeta «Completa tu colegio» te recordará lo
              pendiente.
            </p>
          </section>
        )}

        <footer className="onb-footer">
          {paso > 1 ? (
            <button type="button" className="onb-atras" onClick={() => setPaso(paso - 1)}>
              ← Atrás
            </button>
          ) : (
            <span />
          )}
          <div className="onb-acciones">
            {paso === 1 && (
              <M3Button onClick={() => void guardarPaso1(2)} disabled={guardando}>
                Continuar a sedes
              </M3Button>
            )}
            {paso === 2 && (
              <M3Button onClick={() => void guardarPaso2(3)} disabled={guardando}>
                Continuar a estructura
              </M3Button>
            )}
            {paso === 3 && (
              <M3Button
                onClick={() => void generar(4)}
                disabled={guardando || cursosPrevistos === 0}
              >
                Generar {cursosPrevistos} cursos
              </M3Button>
            )}
            {(paso === 4 || paso === 5) && (
              <M3Button onClick={() => setPaso(paso + 1)}>Omitir por ahora</M3Button>
            )}
            {paso === 6 && (
              <M3Button onClick={() => void terminar()} disabled={guardando}>
                Entrar al dashboard
              </M3Button>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}

function tituloDe(paso: number): string {
  switch (paso) {
    case 1:
      return 'Tu colegio';
    case 2:
      return 'Sedes y jornadas';
    case 3:
      return 'Estructura académica';
    case 4:
      return 'Personal del colegio';
    case 5:
      return 'Estudiantes';
    default:
      return 'Todo listo';
  }
}

function bajadaDe(paso: number): string {
  switch (paso) {
    case 1:
      return 'Confirma los datos base. Podrás cambiarlos después en Configuración.';
    case 2:
      return 'Cada curso pertenecerá a una sede y a una de sus jornadas.';
    case 3:
      return 'Genera los cursos por sede y jornada. Podrás editarlos uno a uno después.';
    case 4:
      return 'Agrega al equipo ahora o impórtalo en bloque. También puedes hacerlo después.';
    case 5:
      return 'La importación masiva es la vía recomendada. Puedes omitirla y cargarlos después.';
    default:
      return 'Revisa lo que quedó configurado. Lo pendiente puede completarse después.';
  }
}
