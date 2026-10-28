'use client';

/**
 * Onboarding · configuración inicial del colegio (6 pasos).
 *
 * Réplica del diseño aprobado (`diseno/Exports/Onboarding · *.json`): rail de
 * 320 px con los pasos, contenido con título Fraunces y tarjetas M3.
 *
 * Los 6 pasos están conectados a la API: 1-3 configuran el colegio, 4 agrega
 * personal (reutiliza POST /usuarios) y 5 importa matrículas con un CSV que se
 * valida contra los cursos reales (POST /matriculas/importar).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  esDepartamento,
  esMunicipio,
  Jornada,
  municipiosDe,
  NOMBRES_DEPARTAMENTOS,
  nombreOficialMen,
  nombreSaneado,
  SubdominioSchema,
  subdominioDeNombre,
  TIPOS_DOCUMENTO,
  type ColegioDane,
  type CursoMatricula,
  type EstadoOnboarding,
  type ResultadoImportacionMatriculas,
  type TipoDocumento,
} from '@eduplatform/types';
import { M3Button } from '@/components/M3Button';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { esEmailValido, esNitValido, esTelefonoValido } from '@/lib/validacion';
import { useEmpleados, useRoles, useSedes } from '@/hooks/usePersonas';
import {
  ApiError,
  actualizarUsuario,
  buscarColegioDane,
  crearUsuario,
  finalizarOnboarding,
  generarEstructuraOnboarding,
  getOnboarding,
  guardarColegioOnboarding,
  guardarPasoOnboarding,
  guardarSedeOnboarding,
  importarMatriculas,
  listarCursosMatricula,
} from '@/lib/api';
import {
  aFilaRequest,
  descargarPlantillaMatriculas,
  motivoFilaCsv,
  parsearCsvMatriculas,
  resolverCursoCsv,
  type FilaCsvMatricula,
} from '@/lib/matriculas';

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

/** Campos del alta rápida de personal (paso 4). */
interface EmpleadoForm {
  nombres: string;
  apellidos: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  usuario: string;
  rolId: string;
  sedeId: string;
}

const EMPLEADO_VACIO: EmpleadoForm = {
  nombres: '',
  apellidos: '',
  tipoDocumento: 'CC',
  numeroDocumento: '',
  usuario: '',
  rolId: '',
  sedeId: '',
};

/** Lee un archivo con FileReader (compatible con jsdom en los tests). */
function leerTexto(archivo: File): Promise<string> {
  if (typeof archivo.text === 'function') return archivo.text();
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result ?? ''));
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
    lector.readAsText(archivo);
  });
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
    /** Nombre completo del MEN: va en certificados y actas. */
    nombreOficial: '',
    nit: '',
    codigoDane: '',
    subdominio: '',
    municipio: '',
    departamento: '',
    direccion: '',
    telefono: '',
    email: '',
    // '' = todavía no elige: sin calendario no se muestran los períodos.
    calendario: '' as 'A' | 'B' | '',
    anioLectivo: new Date().getFullYear(),
  });
  /** Errores de validación por campo; se pintan bajo cada campo y se limpian al escribir. */
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [periodos, setPeriodos] = useState<PeriodoForm[]>([]);

  // Paso 1 · consulta del código DANE en los datos abiertos del MEN.
  const [buscandoDane, setBuscandoDane] = useState(false);
  const [daneInfo, setDaneInfo] = useState<ColegioDane | null>(null);
  const [daneError, setDaneError] = useState<string | null>(null);
  // El formulario nace bloqueado: solo el código DANE manda hasta que el MEN
  // responda (o falle). Es una decisión de producto, no un estado de carga.
  const [formHabilitado, setFormHabilitado] = useState(false);
  const [codigoBuscado, setCodigoBuscado] = useState<string | null>(null);
  const busquedaRef = useRef(0);
  const inicializadoRef = useRef(false);
  const sedeInicializadaRef = useRef(false);

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

  // Paso 4 — alta rápida de personal (POST /usuarios con rol y alcance).
  const [empleado, setEmpleado] = useState<EmpleadoForm>(EMPLEADO_VACIO);
  const [credencial, setCredencial] = useState<{ nombre: string; password: string } | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Paso 5 — CSV de matrículas.
  const [filasCsv, setFilasCsv] = useState<FilaCsvMatricula[]>([]);
  const [lineasImportadas, setLineasImportadas] = useState<FilaCsvMatricula[]>([]);
  const [csvMensaje, setCsvMensaje] = useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [resultadoCsv, setResultadoCsv] = useState<ResultadoImportacionMatriculas | null>(null);
  const [importando, setImportando] = useState(false);

  // Consultas de los pasos 4 y 5: solo se disparan cuando el paso está activo.
  const rolesQ = useRoles(paso === 4);
  const sedesQ = useSedes(paso === 4);
  const empleadosQ = useEmpleados('', paso === 4);
  const cursosQ = useQuery<CursoMatricula[]>({
    queryKey: ['matriculas', 'cursos'],
    queryFn: listarCursosMatricula,
    enabled: paso === 5,
    retry: false,
  });

  useEffect(() => {
    if (data === undefined) return;
    setColegio({
      nombre: data.colegio.nombre,
      nombreOficial: data.colegio.nombreOficial ?? '',
      nit: data.colegio.nit ?? '',
      codigoDane: data.colegio.codigoDane,
      subdominio: data.colegio.subdominio,
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
      // El paso 2 edita UNA sede: se carga la existente una sola vez, para que
      // el formulario no aparezca vacío ni se pise lo que el admin escriba.
      if (!sedeInicializadaRef.current) {
        sedeInicializadaRef.current = true;
        setSede({
          nombre: data.sedes[0].nombre,
          direccion: data.sedes[0].direccion ?? '',
          jornadas: [...data.sedes[0].jornadas],
        });
      }
    }
    // Solo la primera carga decide el estado del formulario: si el colegio ya
    // tiene un código completo se habilita SIN repetir la búsqueda, para no
    // pisar con datos del MEN lo que el admin corrigió a mano.
    if (!inicializadoRef.current) {
      inicializadoRef.current = true;
      const codigo = data.colegio.codigoDane.trim();
      const completo = /^\d{12}$/.test(codigo);
      setFormHabilitado(completo);
      setCodigoBuscado(completo ? codigo : null);
    }
  }, [data]);

  const cursosPrevistos = useMemo(() => grados.length * letras.length, [grados, letras]);
  const sedeActual = data?.sedes.find((s) => s.id === sedeId) ?? data?.sedes[0];

  // Paso 4: roles asignables a personal, sedes para el alcance y listado real.
  const rolesEmpleado = (rolesQ.data?.items ?? []).filter(
    (rol) => rol.tipoPersona === 'EMPLEADO' && rol.activo,
  );
  const sedes = sedesQ.data ?? [];
  const personal = (empleadosQ.data?.items ?? []).filter((persona) => !persona.esAdmin);

  // Paso 5: cursos del año vigente y vista previa del CSV.
  const cursosMatricula = useMemo(() => cursosQ.data ?? [], [cursosQ.data]);
  const filasResueltas = useMemo(
    () => filasCsv.map((fila) => ({ fila, motivo: motivoFilaCsv(cursosMatricula, fila) })),
    [filasCsv, cursosMatricula],
  );
  const filasValidas = filasResueltas.filter((item) => item.motivo === null);

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
        calendario: calendarioValido(),
        nit: colegio.nit === '' ? undefined : colegio.nit,
        nombreOficial: colegio.nombreOficial === '' ? undefined : colegio.nombreOficial,
        direccion: colegio.direccion === '' ? undefined : colegio.direccion,
        telefono: colegio.telefono === '' ? undefined : colegio.telefono,
        periodos,
      }),
  });

  /** Calendario elegido: la validación garantiza que no esté vacío al guardar. */
  function calendarioValido(): 'A' | 'B' {
    return colegio.calendario === 'B' ? 'B' : 'A';
  }

  /** Borra el error de un campo en cuanto se corrige. */
  function limpiarError(campo: string): void {
    setErrores((actual) => {
      if (actual[campo] === undefined) return actual;
      const copia = { ...actual };
      delete copia[campo];
      return copia;
    });
  }

  /** El municipio pertenece al departamento anterior: al cambiarlo se limpia. */
  function conDepartamento(valor: string): void {
    setColegio((actual) => ({ ...actual, departamento: valor, municipio: '' }));
    limpiarError('departamento');
    limpiarError('municipio');
  }

  function conMunicipio(valor: string): void {
    setColegio((actual) => ({ ...actual, municipio: valor }));
    limpiarError('municipio');
  }

  /** Sin calendario no hay fechas base que precargar, y sin él no hay períodos. */
  function conCalendario(c: 'A' | 'B'): void {
    setColegio((actual) => ({ ...actual, calendario: c }));
    setPeriodos(periodosBase(c, colegio.anioLectivo));
    limpiarError('calendario');
  }

  function conAnio(valor: string): void {
    const anio = Number(valor.replace(/\D/g, '').slice(0, 4)) || colegio.anioLectivo;
    setColegio((actual) => ({ ...actual, anioLectivo: anio }));
    if (colegio.calendario !== '') setPeriodos(periodosBase(colegio.calendario, anio));
    limpiarError('anio');
  }

  /**
   * Fechas de los períodos: completas, en orden y sin solapes. Devuelve el
   * primer problema o null.
   */
  function revisarPeriodos(): string | null {
    if (colegio.calendario === '') return null;
    if (periodos.length < 2) return 'Necesitas al menos dos períodos académicos.';
    let finAnterior: string | null = null;
    for (const p of periodos) {
      if (p.fechaInicio === '' || p.fechaFin === '') {
        return `${p.nombre}: completa las dos fechas.`;
      }
      if (p.fechaInicio >= p.fechaFin) {
        return `${p.nombre}: el inicio debe ser anterior al fin.`;
      }
      if (finAnterior !== null && p.fechaInicio <= finAnterior) {
        return `${p.nombre}: se cruza con el período anterior.`;
      }
      finAnterior = p.fechaFin;
    }
    return null;
  }

  /**
   * Reglas del paso 1. Se ejecutan al continuar y al «Guardar y salir»: los
   * botones no envían un formulario HTML, así que la validación nativa del
   * navegador nunca corre.
   */
  function validarPaso1(): Record<string, string> {
    const e: Record<string, string> = {};
    if (colegio.nombre.trim().length < 3) {
      e['nombre'] = 'Escribe el nombre del colegio.';
    }
    if (colegio.nit.trim() !== '' && !esNitValido(colegio.nit)) {
      e['nit'] = 'NIT inválido: 9 dígitos y el de verificación, p. ej. 900123456-7.';
    }
    if (colegio.telefono.trim() !== '' && !esTelefonoValido(colegio.telefono)) {
      e['telefono'] = 'Teléfono inválido: entre 7 y 10 dígitos.';
    }
    if (!esEmailValido(colegio.email.trim())) {
      e['email'] = 'Correo inválido: debe tener la forma nombre@dominio.';
    }
    if (!esDepartamento(colegio.departamento)) {
      e['departamento'] = 'Elige el departamento.';
    }
    if (!esMunicipio(colegio.departamento, colegio.municipio)) {
      e['municipio'] = 'Elige el municipio del departamento.';
    }
    if (!SubdominioSchema.safeParse(colegio.subdominio).success) {
      e['subdominio'] = 'Entre 3 y 32 caracteres: minúsculas, números y guiones.';
    }
    if (colegio.calendario === '') {
      e['calendario'] = 'Elige el calendario escolar.';
    }
    if (colegio.anioLectivo < 2020 || colegio.anioLectivo > 2100) {
      e['anio'] = 'El año debe estar entre 2020 y 2100.';
    }
    const problemas = revisarPeriodos();
    if (problemas !== null) e['periodos'] = problemas;
    return e;
  }

  /**
   * El subdominio se sugiere desde el nombre mientras el admin no lo toque: si
   * el que hay sigue siendo el derivado del nombre anterior (o está vacío), se
   * recalcula. Un subdominio propio (semilla o escrito a mano) se respeta, para
   * no cambiar la URL del colegio cada vez que se corrige el nombre.
   */
  function conNombre(valor: string): void {
    setColegio((actual) => {
      const derivado = subdominioDeNombre(actual.nombre);
      const seguiaAlNombre = actual.subdominio === '' || actual.subdominio === derivado;
      return {
        ...actual,
        nombre: valor,
        subdominio: seguiaAlNombre ? subdominioDeNombre(valor) : actual.subdominio,
      };
    });
  }

  /** Mientras se escribe solo se permiten caracteres válidos (sin exigir el mínimo). */
  function conSubdominio(valor: string): void {
    setColegio((actual) => ({
      ...actual,
      subdominio: valor
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+/, '')
        .slice(0, 32),
    }));
  }

  /**
   * Paso 1: busca el establecimiento en el MEN y, pase lo que pase, habilita el
   * formulario. Un código inexistente o el portal caído no pueden dejar al
   * admin bloqueado. Las respuestas que llegan tarde (siguió editando) se
   * descartan con el contador de búsquedas.
   */
  async function buscarDane(codigo: string): Promise<void> {
    const id = busquedaRef.current + 1;
    busquedaRef.current = id;
    setBuscandoDane(true);
    setDaneError(null);
    setAviso(null);
    try {
      const datos = await buscarColegioDane(codigo);
      if (id !== busquedaRef.current) return;
      setDaneInfo(datos);
      setCodigoBuscado(codigo);
      // El MEN manda «INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL …»: lo
      // dejamos en «I.E.T.D. …» antes de prellenar, y el admin ajusta si quiere.
      const nombre = nombreSaneado(datos.nombre);
      setColegio((actual) => {
        const derivado = subdominioDeNombre(actual.nombre);
        const seguiaAlNombre = actual.subdominio === '' || actual.subdominio === derivado;
        return {
          ...actual,
          nombre,
          // El nombre completo se guarda aparte: es el que va en los documentos.
          nombreOficial: nombreOficialMen(datos.nombre),
          municipio: datos.municipio,
          departamento: datos.departamento,
          direccion: datos.direccion ?? '',
          telefono: datos.telefono ?? '',
          email: datos.email ?? actual.email,
          calendario: datos.calendario,
          subdominio: seguiaAlNombre ? subdominioDeNombre(nombre) : actual.subdominio,
        };
      });
      if (datos.calendario !== colegio.calendario) {
        setPeriodos(periodosBase(datos.calendario, colegio.anioLectivo));
      }
      setExito(`Datos del MEN de ${datos.anio} cargados. Revísalos y ajusta lo que haga falta.`);
    } catch (e) {
      if (id !== busquedaRef.current) return;
      setDaneInfo(null);
      setDaneError(mensajeDeError(e, 'No pudimos consultar los datos del MEN.'));
    } finally {
      if (id === busquedaRef.current) {
        setBuscandoDane(false);
        setFormHabilitado(true);
      }
    }
  }

  /**
   * El código es la única puerta del paso 1: mientras no coincida con el que se
   * verificó, el formulario queda bloqueado, y a los 12 dígitos se busca solo.
   */
  function conCodigo(valor: string): void {
    const limpio = valor.replace(/\D/g, '').slice(0, 12);
    setColegio((actual) => ({ ...actual, codigoDane: limpio }));
    setDaneError(null);
    // El aviso y la ficha del MEN hablan del código anterior: si cambia, se van.
    setExito(null);
    if (limpio.length === 12 && limpio === codigoBuscado) {
      setFormHabilitado(true);
      return;
    }
    setDaneInfo(null);
    setFormHabilitado(false);
    if (limpio.length === 12) void buscarDane(limpio);
  }

  async function guardarPaso1(siguiente: number): Promise<void> {
    const problemas = validarPaso1();
    setErrores(problemas);
    if (Object.keys(problemas).length > 0) {
      setAviso('Revisa los campos marcados antes de continuar.');
      return;
    }
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

  /**
   * «Guardar y salir»: guarda de verdad el paso actual. Antes solo llamaba a
   * `guardarPasoOnboarding(paso)`, que marca el paso en el colegio y no escribe
   * los datos, así que en el paso 1 se perdía todo lo escrito.
   */
  async function salir(): Promise<void> {
    setAviso(null);
    setGuardando(true);
    try {
      if (paso === 1) {
        if (!formHabilitado) {
          router.push('/dashboard');
          return;
        }
        const problemas = validarPaso1();
        setErrores(problemas);
        if (Object.keys(problemas).length > 0) {
          setAviso('Revisa los campos marcados: no se guardó nada.');
          return;
        }
        aplicar(await mutColegio.mutateAsync(), 1);
      } else if (paso === 2) {
        if (sede.jornadas.length === 0) {
          setAviso('Elige al menos una jornada para la sede.');
          return;
        }
        await guardarSedeOnboarding({
          id: sedeActual?.id,
          nombre: sede.nombre,
          direccion: sede.direccion === '' ? undefined : sede.direccion,
          jornadas: sede.jornadas,
        });
      }
      qc.setQueryData(['onboarding'], await guardarPasoOnboarding(paso));
      router.push('/dashboard');
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
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

  function mensajeDeError(error: unknown, porDefecto: string): string {
    return error instanceof ApiError ? error.message : porDefecto;
  }

  /** Refresca el estado del wizard y el listado de personal del paso 4. */
  async function refrescarWizard(): Promise<void> {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['onboarding'] }),
      qc.invalidateQueries({ queryKey: ['personas', 'empleados'] }),
    ]);
  }

  /** Paso 4: crea la cuenta del empleado con rol y alcance por sede. */
  async function crearEmpleado(): Promise<void> {
    if (
      empleado.nombres.trim().length < 2 ||
      empleado.apellidos.trim().length < 2 ||
      empleado.numeroDocumento.trim().length < 4 ||
      empleado.usuario.trim() === '' ||
      empleado.rolId === ''
    ) {
      setAviso('Completa nombres, apellidos, documento, usuario y rol para agregar personal.');
      return;
    }

    setGuardando(true);
    setAviso(null);
    setExito(null);
    try {
      const creado = await crearUsuario({
        nombres: empleado.nombres.trim(),
        apellidos: empleado.apellidos.trim(),
        usuario: empleado.usuario.trim(),
        tipoDocumento: empleado.tipoDocumento,
        numeroDocumento: empleado.numeroDocumento.trim(),
        esAdmin: false,
        rolId: empleado.rolId,
        alcance: empleado.sedeId === '' ? 'TODAS' : 'ESPECIFICAS',
        sedesIds: empleado.sedeId === '' ? [] : [empleado.sedeId],
        permisos: [],
      });
      setCredencial({
        nombre: `${creado.usuario.nombres} ${creado.usuario.apellidos}`,
        password: creado.passwordTemporal,
      });
      setEmpleado({ ...EMPLEADO_VACIO, tipoDocumento: empleado.tipoDocumento });
      await refrescarWizard();
      setExito('Personal agregado. Comparte la contraseña temporal: solo se muestra una vez.');
    } catch (e) {
      setAviso(mensajeDeError(e, 'No se pudo agregar a la persona.'));
    } finally {
      setGuardando(false);
    }
  }

  /** Paso 4: baja lógica de la cuenta (reversible desde Personas → Empleados). */
  async function quitarEmpleado(id: string, nombre: string): Promise<void> {
    setGuardando(true);
    setAviso(null);
    setExito(null);
    try {
      await actualizarUsuario(id, { activo: false });
      await refrescarWizard();
      setExito(`${nombre} quedó inactivo. Puedes reactivarlo en Personas → Empleados.`);
    } catch (e) {
      setAviso(mensajeDeError(e, 'No se pudo quitar a la persona.'));
    } finally {
      setGuardando(false);
    }
  }

  /** Avanza y persiste el paso (el progreso es cosmético: no bloquea). */
  async function avanzar(destino: number): Promise<void> {
    try {
      const estado = await guardarPasoOnboarding(destino);
      qc.setQueryData(['onboarding'], estado);
    } catch {
      // Sin conexión el wizard sigue: el paso se guarda al finalizar.
    }
    setPaso(destino);
    setAviso(null);
    setExito(null);
  }

  /** Paso 5: lee el CSV en el cliente y arma la vista previa. */
  async function leerCsv(evento: ChangeEvent<HTMLInputElement>): Promise<void> {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (archivo === undefined) return;

    setNombreArchivo(archivo.name);
    setResultadoCsv(null);
    setExito(null);
    setAviso(null);
    try {
      const leido = parsearCsvMatriculas(await leerTexto(archivo));
      setFilasCsv(leido.filas);
      setCsvMensaje(
        leido.errores.length > 0
          ? leido.errores.join(' · ')
          : `${leido.filas.length} fila(s) listas para revisar.`,
      );
    } catch {
      setFilasCsv([]);
      setCsvMensaje('No pudimos leer el archivo. Guarda el CSV en UTF-8 separado por comas.');
    }
  }

  /** Paso 5: envía solo las filas válidas; la API reporta sus propios errores. */
  async function importarCsv(): Promise<void> {
    if (filasValidas.length === 0) {
      setAviso('No hay filas válidas para importar.');
      return;
    }
    setImportando(true);
    setAviso(null);
    setExito(null);
    try {
      const enviadas = filasValidas.map((item) => item.fila);
      const resultado = await importarMatriculas({ filas: enviadas.map(aFilaRequest) });
      setResultadoCsv(resultado);
      setLineasImportadas(enviadas);
      setFilasCsv([]);
      setNombreArchivo('');
      setCsvMensaje(null);
      await qc.invalidateQueries({ queryKey: ['onboarding'] });
      if (resultado.creadas > 0) {
        setExito(`Se matricularon ${resultado.creadas} estudiante(s).`);
      }
    } catch (e) {
      setAviso(mensajeDeError(e, 'No se pudo importar el CSV.'));
    } finally {
      setImportando(false);
    }
  }

  // Selects de departamento y municipio. Si el colegio trae un valor que no está
  // en el catálogo del MEN (datos viejos), se antepone para no mostrarlo vacío.
  const opcionesDepartamento = useMemo(() => {
    const base = NOMBRES_DEPARTAMENTOS;
    return colegio.departamento !== '' && !base.includes(colegio.departamento)
      ? [colegio.departamento, ...base]
      : base;
  }, [colegio.departamento]);

  const opcionesMunicipio = useMemo(() => {
    const base = municipiosDe(colegio.departamento);
    return colegio.municipio !== '' && !base.includes(colegio.municipio)
      ? [colegio.municipio, ...base]
      : base;
  }, [colegio.departamento, colegio.municipio]);

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

        {exito !== null && (
          <p className="onb-ok" role="status">
            {exito}
          </p>
        )}

        {paso === 1 && (
          <section className="onb-card" aria-busy={buscandoDane}>
            <h2 className="onb-card-titulo">Identidad del colegio</h2>
            <TextField
              id="onb-dane"
              label="Código DANE"
              value={colegio.codigoDane}
              onChange={conCodigo}
              error={daneError}
              autoFocus
              ayuda={
                buscandoDane
                  ? 'Buscando los datos del colegio en el MEN…'
                  : formHabilitado
                    ? '12 dígitos. Los datos del colegio se completan solos.'
                    : 'Escribe los 12 dígitos del código DANE para ver el resto del formulario.'
              }
            />

            {daneInfo !== null && (
              <p className="onb-nota">
                Datos del MEN ({daneInfo.anio}): {daneInfo.sector ?? 'sector sin dato'} ·{' '}
                {daneInfo.caracter ?? 'carácter sin dato'} · rector {daneInfo.rector ?? 'sin dato'}{' '}
                · {daneInfo.matricula} matriculado(s) · {daneInfo.sedes} sede(s).
              </p>
            )}

            {!formHabilitado && !buscandoDane && (
              <p className="onb-nota">
                Con el código DANE se traen el nombre, el municipio y la dirección del
                establecimiento. Si el código no aparece en el MEN también podrás escribir los datos
                a mano.
              </p>
            )}

            {formHabilitado && (
              <div className="onb-form">
                <div className="onb-grid">
                  <TextField
                    id="onb-nombre"
                    label="Nombre"
                    value={colegio.nombre}
                    onChange={conNombre}
                    error={errores['nombre']}
                  />
                  <TextField
                    id="onb-nit"
                    label="NIT (opcional)"
                    value={colegio.nit}
                    onChange={(v) => {
                      setColegio({ ...colegio, nit: v });
                      limpiarError('nit');
                    }}
                    error={errores['nit']}
                    ayuda="Con dígito de verificación, p. ej. 900123456-7."
                  />
                  {/* El nombre completo es largo: ocupa las dos columnas. */}
                  <div className="onb-campo-ancho">
                    <TextField
                      id="onb-nombre-oficial"
                      label="Nombre oficial (documentos)"
                      value={colegio.nombreOficial}
                      onChange={(v) => setColegio({ ...colegio, nombreOficial: v })}
                      ayuda="Como lo registra el MEN; se imprime en certificados y actas."
                    />
                  </div>
                  <SelectField
                    id="onb-departamento"
                    label="Departamento"
                    value={colegio.departamento}
                    onChange={conDepartamento}
                    opciones={opcionesDepartamento.map((d) => ({ valor: d, texto: d }))}
                    placeholder="Elige…"
                    error={errores['departamento']}
                  />
                  <SelectField
                    id="onb-municipio"
                    label="Municipio"
                    value={colegio.municipio}
                    onChange={conMunicipio}
                    opciones={opcionesMunicipio.map((m) => ({ valor: m, texto: m }))}
                    placeholder={colegio.departamento === '' ? 'Primero el departamento' : 'Elige…'}
                    error={errores['municipio']}
                    disabled={colegio.departamento === ''}
                    ayuda={
                      colegio.departamento === ''
                        ? 'Se habilita al elegir el departamento.'
                        : undefined
                    }
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
                    onChange={(v) => {
                      setColegio({ ...colegio, telefono: v });
                      limpiarError('telefono');
                    }}
                    error={errores['telefono']}
                  />
                  <TextField
                    id="onb-email"
                    label="Correo del colegio"
                    tipo="email"
                    value={colegio.email}
                    onChange={(v) => {
                      setColegio({ ...colegio, email: v });
                      limpiarError('email');
                    }}
                    error={errores['email']}
                  />
                  <TextField
                    id="onb-sub"
                    label="Subdominio"
                    value={colegio.subdominio}
                    onChange={(v) => {
                      conSubdominio(v);
                      limpiarError('subdominio');
                    }}
                    ayuda="Se sugiere del nombre; puedes cambiarlo."
                    error={errores['subdominio']}
                  />
                </div>

                <p className="onb-nota">
                  Tus usuarios entran por la dirección del colegio (
                  <strong>{data.colegio.subdominio}</strong>) con su nombre de usuario y contraseña;
                  no hace falta que sea un correo real.
                </p>

                <div className="onb-fila-calendario">
                  <div>
                    <span className="onb-etiqueta" id="onb-calendario-etiqueta">
                      Calendario escolar
                    </span>
                    <div
                      className="onb-opciones"
                      role="radiogroup"
                      aria-labelledby="onb-calendario-etiqueta"
                    >
                      {(['A', 'B'] as const).map((c) => (
                        <label
                          key={c}
                          className={`onb-chip${colegio.calendario === c ? ' onb-chip--on' : ''}`}
                        >
                          <input
                            type="radio"
                            name="calendario"
                            checked={colegio.calendario === c}
                            onChange={() => conCalendario(c)}
                          />
                          Calendario {c}
                        </label>
                      ))}
                    </div>
                    {errores['calendario'] !== undefined && (
                      <p className="onb-error m3-body-small" role="alert">
                        {errores['calendario']}
                      </p>
                    )}
                  </div>
                  <div className="onb-anio">
                    <TextField
                      id="onb-anio"
                      label="Año lectivo"
                      value={String(colegio.anioLectivo)}
                      onChange={conAnio}
                      error={errores['anio']}
                    />
                  </div>
                </div>

                {colegio.calendario !== '' && (
                  <>
                    <p className="onb-nota">
                      Períodos académicos precargados según el calendario {colegio.calendario}.
                      Puedes ajustar las fechas.
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
                                limpiarError('periodos');
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
                                limpiarError('periodos');
                              }}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                    {errores['periodos'] !== undefined && (
                      <p className="onb-error m3-body-small" role="alert">
                        {errores['periodos']}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
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

        {paso === 4 && (
          <section className="onb-card">
            <div className="onb-card-cabecera">
              <h2 className="onb-card-titulo">Agregar personal</h2>
              <span className="onb-contador">
                {data.personal.total} {data.personal.total === 1 ? 'persona' : 'personas'} en el
                colegio
              </span>
            </div>

            <div className="onb-grid">
              <TextField
                id="onb-emp-nombres"
                label="Nombres"
                value={empleado.nombres}
                onChange={(v) => setEmpleado({ ...empleado, nombres: v })}
              />
              <TextField
                id="onb-emp-apellidos"
                label="Apellidos"
                value={empleado.apellidos}
                onChange={(v) => setEmpleado({ ...empleado, apellidos: v })}
              />
              <label className="onb-campo">
                Tipo de documento
                <select
                  value={empleado.tipoDocumento}
                  onChange={(e) =>
                    setEmpleado({ ...empleado, tipoDocumento: e.target.value as TipoDocumento })
                  }
                >
                  {TIPOS_DOCUMENTO.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                id="onb-emp-documento"
                label="Número de documento"
                value={empleado.numeroDocumento}
                onChange={(v) => setEmpleado({ ...empleado, numeroDocumento: v })}
              />
              <TextField
                id="onb-emp-usuario"
                label="Nombre de usuario"
                value={empleado.usuario}
                onChange={(v) => setEmpleado({ ...empleado, usuario: v })}
                ayuda="Con esto entrará a la plataforma (p. ej. rector.garcia)"
              />
              <label className="onb-campo">
                Rol
                <select
                  value={empleado.rolId}
                  onChange={(e) => setEmpleado({ ...empleado, rolId: e.target.value })}
                >
                  <option value="">Elige un rol…</option>
                  {rolesEmpleado.map((rol) => (
                    <option key={rol.id} value={rol.id}>
                      {rol.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="onb-campo">
                Sede (alcance)
                <select
                  value={empleado.sedeId}
                  onChange={(e) => setEmpleado({ ...empleado, sedeId: e.target.value })}
                >
                  <option value="">Todas las sedes</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="onb-acciones">
              <M3Button
                icono="person_add"
                onClick={() => void crearEmpleado()}
                disabled={guardando}
              >
                Agregar al equipo
              </M3Button>
            </div>

            {credencial !== null && (
              <div className="onb-credencial" role="status">
                <p>
                  <strong>{credencial.nombre}</strong> quedó creado. Esta contraseña temporal se
                  muestra una sola vez:
                </p>
                <code>{credencial.password}</code>
              </div>
            )}

            <h2 className="onb-card-titulo">Personal agregado</h2>
            {empleadosQ.isLoading ? (
              <p className="onb-nota">Cargando personal…</p>
            ) : personal.length === 0 ? (
              <p className="onb-nota">
                Además de tu cuenta de administrador aún no hay personal. Puedes continuar sin
                agregar a nadie y hacerlo después en Personas → Empleados.
              </p>
            ) : (
              <div className="onb-tabla-envoltura">
                <table className="onb-tabla">
                  <thead>
                    <tr>
                      <th scope="col">Persona</th>
                      <th scope="col">Documento</th>
                      <th scope="col">Rol</th>
                      <th scope="col">Estado</th>
                      <th scope="col">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {personal.map((persona) => (
                      <tr key={persona.id}>
                        <td>
                          <strong>
                            {persona.nombres} {persona.apellidos}
                          </strong>
                          <span className="onb-celda-detalle">{persona.usuario}</span>
                        </td>
                        <td>{persona.numeroDocumento}</td>
                        <td>{persona.rolNombre ?? 'Sin rol'}</td>
                        <td>
                          <span className="onb-chip onb-chip--solo">
                            {persona.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          {persona.activo ? (
                            <button
                              type="button"
                              className="onb-quitar"
                              onClick={() =>
                                void quitarEmpleado(
                                  persona.id,
                                  `${persona.nombres} ${persona.apellidos}`,
                                )
                              }
                              disabled={guardando}
                            >
                              Quitar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!rolesQ.isLoading && rolesEmpleado.length === 0 && (
              <p className="onb-nota">
                No hay roles de tipo empleado activos: créalos en Personas → Roles antes de agregar
                personal.
              </p>
            )}
          </section>
        )}

        {paso === 5 && (
          <section className="onb-card">
            <div className="onb-card-cabecera">
              <h2 className="onb-card-titulo">Importar estudiantes (CSV)</h2>
              <span className="onb-contador">
                {data.estudiantes.matriculados} matriculado(s) de {data.estudiantes.total}{' '}
                estudiante(s)
              </span>
            </div>

            <div className="onb-archivo-fila">
              <label className="onb-archivo">
                <span className="material-symbols-outlined" aria-hidden="true">
                  upload_file
                </span>
                {nombreArchivo === '' ? 'Elegir archivo CSV' : nombreArchivo}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(evento) => void leerCsv(evento)}
                />
              </label>
              <M3Button variante="outlined" icono="download" onClick={descargarPlantillaMatriculas}>
                Descargar plantilla
              </M3Button>
            </div>

            <p className="onb-nota">
              Columnas: documento, nombres, apellidos, correo, sede, grado (6 o 6°), letra, jornada
              (Mañana, Tarde, Noche, Única o Sabatina) y fechaNacimiento opcional. Solo se
              matriculan cuentas que ya existen; si el estudiante no tiene ficha, agrega la fecha de
              nacimiento.
            </p>

            {cursosQ.isLoading && <p className="onb-nota">Cargando cursos del año lectivo…</p>}
            {cursosQ.isError && (
              <p className="onb-aviso" role="alert">
                No pudimos cargar los cursos del año lectivo. Revisa la conexión y vuelve a entrar
                al paso 5.
              </p>
            )}
            {cursosQ.isSuccess && cursosMatricula.length === 0 && (
              <p className="onb-nota">
                No hay cursos en el año vigente: vuelve al paso 3 y genera la estructura.
              </p>
            )}

            {csvMensaje !== null && (
              <p className="onb-nota" role="status">
                {csvMensaje}
              </p>
            )}

            {csvMensaje === null && nombreArchivo === '' && resultadoCsv === null && (
              <p className="onb-nota">
                Aún no has cargado un archivo. Puedes continuar y hacer la carga después: el
                checklist «Completa tu colegio» te lo recordará.
              </p>
            )}

            {filasCsv.length > 0 && (
              <>
                <div className="onb-tabla-envoltura">
                  <table className="onb-tabla onb-tabla--csv">
                    <thead>
                      <tr>
                        <th scope="col">Línea</th>
                        <th scope="col">Documento</th>
                        <th scope="col">Estudiante</th>
                        <th scope="col">Curso</th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasResueltas.map(({ fila, motivo }) => {
                        const nombre = `${fila.nombres} ${fila.apellidos}`.trim();
                        return (
                          <tr key={fila.linea}>
                            <td>{fila.linea}</td>
                            <td>{fila.documento}</td>
                            <td>{nombre === '' ? '—' : nombre}</td>
                            <td>{resolverCursoCsv(cursosMatricula, fila)?.nombre ?? '—'}</td>
                            <td>
                              {motivo === null ? (
                                <span className="onb-chip onb-chip--ok">Válida</span>
                              ) : (
                                <span className="onb-chip onb-chip--error">{motivo}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="onb-acciones">
                  <M3Button
                    icono="upload"
                    onClick={() => void importarCsv()}
                    disabled={importando || filasValidas.length === 0}
                  >
                    Importar {filasValidas.length} fila(s) válida(s)
                  </M3Button>
                </div>
              </>
            )}

            {resultadoCsv !== null && (
              <div className="onb-resultado" role="status">
                <p>
                  <strong>{resultadoCsv.creadas}</strong> matrícula(s) creada(s).
                </p>
                {resultadoCsv.errores.length > 0 ? (
                  <ul>
                    {resultadoCsv.errores.map((error) => {
                      const original = lineasImportadas[error.fila - 1];
                      return (
                        <li key={`${error.fila}-${error.motivo}`}>
                          Línea {original?.linea ?? error.fila}: {error.motivo}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="onb-nota">Sin errores.</p>
                )}
              </div>
            )}
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
            {paso === 1 && formHabilitado && (
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
            {paso === 4 && (
              <M3Button onClick={() => void avanzar(5)} disabled={guardando}>
                Continuar a estudiantes
              </M3Button>
            )}
            {paso === 5 && (
              <M3Button onClick={() => void avanzar(6)} disabled={importando}>
                Continuar al resumen
              </M3Button>
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
