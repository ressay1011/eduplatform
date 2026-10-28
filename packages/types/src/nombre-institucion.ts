/**
 * Saneado del nombre institucional que publica el MEN.
 *
 * El MEN escribe «INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL JUANA ARIAS DE
 * BENAVIDES»; en la ficha queremos «I.E.T.D. Juana Arias de Benavides».
 *
 * Reglas (acordadas con el usuario el 2026-10-27 sobre el corpus real de 17.872
 * establecimientos de 2025):
 *  1. Se quitan los marcadores de relleno entre paréntesis —«(IED)», «(C.E.)»…—
 *     y se normalizan los espacios.
 *  2. Las abreviaturas sueltas del MEN («I.E.», «IE», «INST EDUC», «COL»,
 *     «C.E.») se expanden a su forma completa para que el bloque sea uniforme.
 *  3. Al INICIO se consume el bloque de contenedores (institución, centro,
 *     colegio, liceo, gimnasio, jardín, escuela, instituto) más los
 *     calificativos OFICIALES (técnica, académica, agropecuaria, rural,
 *     departamental…). Cada palabra aporta su inicial: I.E.T.D.
 *     No hay tope de iniciales (decisión del usuario).
 *  4. El resto pasa a Título con los conectores en minúscula («de», «del»…) y
 *     los artículos en mayúscula solo al principio del nombre propio («La
 *     Floresta»).
 *  5. Se restauran las tildes de un diccionario corto de nombres y lugares,
 *     porque el MEN suele escribirlos sin tilde.
 *
 * Es una SUGERENCIA para el paso 1 del onboarding: el admin la edita si quiere.
 */

/** Palabras que nombran el tipo de establecimiento. */
const CONTENEDORES = new Set([
  'INSTITUCION',
  'CENTRO',
  'COLEGIO',
  'LICEO',
  'GIMNASIO',
  'JARDIN',
  'ESCUELA',
  'INSTITUTO',
]);

/** Calificativos oficiales: entran en el bloque de iniciales. */
const CALIFICATIVOS = new Set([
  'EDUCATIVA',
  'EDUCATIVO',
  'TECNICA',
  'TECNICO',
  'ACADEMICA',
  'ACADEMICO',
  'ETNOEDUCATIVA',
  'ETNOEDUCATIVO',
  'DEPARTAMENTAL',
  'DISTRITAL',
  'MUNICIPAL',
  'RURAL',
  'URBANA',
  'URBANO',
  'MIXTA',
  'MIXTO',
  'NORMAL',
  'SUPERIOR',
  'POLITECNICO',
  'PARROQUIAL',
  'AGROPECUARIA',
  'AGROPECUARIO',
  'AGROINDUSTRIAL',
  'AGROAMBIENTAL',
  'AGROECOLOGICA',
  'COMERCIAL',
  'INDUSTRIAL',
  'EMPRESARIAL',
  'TURISTICA',
  'AMBIENTAL',
]);

/** Abreviaturas del MEN que se expanden antes de abreviar. */
const EXPANSIONES: Readonly<Record<string, readonly string[]>> = {
  'I.E.': ['INSTITUCION', 'EDUCATIVA'],
  'I.E': ['INSTITUCION', 'EDUCATIVA'],
  IE: ['INSTITUCION', 'EDUCATIVA'],
  'C.E.': ['CENTRO', 'EDUCATIVO'],
  'C.E': ['CENTRO', 'EDUCATIVO'],
  CE: ['CENTRO', 'EDUCATIVO'],
  INST: ['INSTITUCION'],
  INSTITUC: ['INSTITUCION'],
  EDUC: ['EDUCATIVA'],
  COL: ['COLEGIO'],
};

/** Preposiciones y conjunciones: siempre en minúscula. */
const PREPOSICIONES = new Set([
  'de',
  'del',
  'con',
  'por',
  'para',
  'en',
  'al',
  'y',
  'e',
  'da',
  'do',
  'dos',
  'das',
  'van',
  'von',
]);

/** Artículos: minúscula salvo cuando abren el nombre propio. */
const ARTICULOS = new Set(['la', 'las', 'los', 'el', 'lo']);

/** Tildes que el MEN omite (solo palabras inequívocas). */
const TILDES: Readonly<Record<string, string>> = {
  jose: 'José',
  maria: 'María',
  jesus: 'Jesús',
  angel: 'Ángel',
  martin: 'Martín',
  simon: 'Simón',
  andres: 'Andrés',
  sebastian: 'Sebastián',
  cristobal: 'Cristóbal',
  agustin: 'Agustín',
  joaquin: 'Joaquín',
  german: 'Germán',
  ruben: 'Rubén',
  ramon: 'Ramón',
  fabian: 'Fabián',
  julian: 'Julián',
  damian: 'Damián',
  leon: 'León',
  adrian: 'Adrián',
  gomez: 'Gómez',
  lopez: 'López',
  rodriguez: 'Rodríguez',
  gonzalez: 'González',
  hernandez: 'Hernández',
  martinez: 'Martínez',
  perez: 'Pérez',
  sanchez: 'Sánchez',
  ramirez: 'Ramírez',
  jimenez: 'Jiménez',
  vasquez: 'Vásquez',
  diaz: 'Díaz',
  munoz: 'Muñoz',
  nunez: 'Núñez',
  garcia: 'García',
  velasquez: 'Velásquez',
  velez: 'Vélez',
  victor: 'Víctor',
  alvarez: 'Álvarez',
  gutierrez: 'Gutiérrez',
  rincon: 'Rincón',
  calderon: 'Calderón',
  beltran: 'Beltrán',
  cardenas: 'Cárdenas',
  cortes: 'Cortés',
  suarez: 'Suárez',
  bermudez: 'Bermúdez',
  mejia: 'Mejía',
  sepulveda: 'Sepúlveda',
  jerónimo: 'Jerónimo',
  jeronimo: 'Jerónimo',
  salomon: 'Salomón',
  moises: 'Moisés',
  isaias: 'Isaías',
  lucia: 'Lucía',
  sofia: 'Sofía',
  cesar: 'César',
  ines: 'Inés',
  // Palabras institucionales: el MEN también las escribe sin tilde y el nombre
  // oficial tiene que salir correcto en certificados y actas.
  institucion: 'Institución',
  tecnica: 'Técnica',
  tecnico: 'Técnico',
  academica: 'Académica',
  academico: 'Académico',
  pedagogica: 'Pedagógica',
  pedagogico: 'Pedagógico',
  psicopedagogica: 'Psicopedagógica',
  psicopedagogico: 'Psicopedagógico',
  artistica: 'Artística',
  artistico: 'Artístico',
  cientifica: 'Científica',
  cientifico: 'Científico',
  tecnologica: 'Tecnológica',
  tecnologico: 'Tecnológico',
  ecologica: 'Ecológica',
  ecologico: 'Ecológico',
  agricola: 'Agrícola',
  agronomia: 'Agronomía',
  agronomica: 'Agronómica',
  agronomico: 'Agronómico',
  publica: 'Pública',
  publico: 'Público',
  basica: 'Básica',
  basico: 'Básico',
  juridica: 'Jurídica',
  juridico: 'Jurídico',
  economica: 'Económica',
  economico: 'Económico',
  informatica: 'Informática',
  informatico: 'Informático',
  electrica: 'Eléctrica',
  electrico: 'Eléctrico',
  mecanica: 'Mecánica',
  mecanico: 'Mecánico',
  quimica: 'Química',
  quimico: 'Químico',
  fisica: 'Física',
  matematica: 'Matemática',
  matematico: 'Matemático',
  historia: 'Historia',
  historica: 'Histórica',
  historico: 'Histórico',
  bolivariana: 'Bolivariana',
  bolivar: 'Bolívar',
  cordoba: 'Córdoba',
  narino: 'Nariño',
  panama: 'Panamá',
  popayan: 'Popayán',
  medellin: 'Medellín',
  bogota: 'Bogotá',
  ibague: 'Ibagué',
  monteria: 'Montería',
  quibdo: 'Quibdó',
  cucuta: 'Cúcuta',
  chia: 'Chía',
  zipaquira: 'Zipaquirá',
  facatativa: 'Facatativá',
  bahia: 'Bahía',
  maiz: 'Maíz',
  catolico: 'Católico',
  caqueta: 'Caquetá',
  choco: 'Chocó',
  atlantico: 'Atlántico',
  pacifico: 'Pacífico',
  america: 'América',
  espana: 'España',
};

/** Quita tildes y diéresis para comparar. */
function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Palabra en Título, respetando conectores, artículos y siglas con punto. */
function enTitulo(palabra: string, anterior: string): string {
  const minus = palabra.toLowerCase();
  if (PREPOSICIONES.has(minus)) return minus;
  // «El Arca» lleva mayúscula; «de la Candelaria» no, porque sigue a preposición.
  if (ARTICULOS.has(minus)) return PREPOSICIONES.has(anterior) ? minus : capitalizar(minus);
  // Siglas escritas con puntos («S.A.S», «F.»): se dejan como están.
  if (palabra.includes('.')) return palabra.toUpperCase();
  return capitalizar(TILDES[minus] ?? minus);
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Marcas entre paréntesis que no aportan al nombre, ya normalizadas. */
const MARCADORES = new Set(['IED', 'IE', 'ID', 'CE', 'CDI', 'SAS']);

/**
 * Quita las marcas de relleno entre paréntesis: `(IED)`, `(C.E.)`, `(S.A.S)`.
 * Se resuelve con un callback en vez de una expresión regular con alternativas
 * y espacios opcionales, que en CodeQL es un ReDoS polinómico.
 */
function sinMarcadores(nombre: string): string {
  return nombre.replace(/\(([^)]{0,40})\)/g, (entero: string, dentro: string) => {
    const clave = sinTildes(dentro)
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    return MARCADORES.has(clave) ? ' ' : entero;
  });
}

/**
 * Tokeniza el nombre y expande las abreviaturas sueltas del MEN. `clave` es la
 * forma de comparación: sin tildes y en mayúsculas.
 */
function tokenizar(nombre: string): { texto: string; clave: string }[] {
  const limpio = sinMarcadores(nombre).replace(/\s+/g, ' ').trim();
  if (limpio === '') return [];

  const tokens: { texto: string; clave: string }[] = [];
  for (const crudo of limpio.split(' ')) {
    const clave = sinTildes(crudo).toUpperCase();
    const expansion = EXPANSIONES[clave];
    if (expansion !== undefined) {
      for (const palabra of expansion) tokens.push({ texto: palabra, clave: palabra });
    } else {
      tokens.push({ texto: crudo, clave });
    }
  }
  return tokens;
}

/**
 * Nombre COMPLETO del establecimiento para documentos oficiales: el mismo texto
 * que publica el MEN, en mayúsculas y con las tildes restauradas.
 * «INSTITUCION EDUCATIVA TECNICA DEPARTAMENTAL VICTOR CAMARGO ALVAREZ» →
 * «INSTITUCIÓN EDUCATIVA TÉCNICA DEPARTAMENTAL VÍCTOR CAMARGO ÁLVAREZ».
 */
export function nombreOficialMen(nombre: string): string {
  return tokenizar(nombre)
    .map((token) => (TILDES[token.clave.toLowerCase()] ?? token.texto).toUpperCase())
    .join(' ')
    .trim();
}

/**
 * Devuelve el nombre institucional saneado a partir del nombre del MEN.
 * No falla nunca: si no reconoce nada, devuelve el nombre en Título.
 */
export function nombreSaneado(nombre: string): string {
  const tokens = tokenizar(nombre);

  // Bloque inicial de iniciales.
  const iniciales: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const clave = tokens[i]?.clave ?? '';
    if (!CONTENEDORES.has(clave) && !CALIFICATIVOS.has(clave)) break;
    iniciales.push(clave.charAt(0));
    i += 1;
  }

  const resto = tokens.slice(i);
  const titulo = resto
    .map((token, indice) => enTitulo(token.texto, resto[indice - 1]?.texto.toLowerCase() ?? ''))
    .join(' ')
    .trim();

  const siglas = iniciales.map((letra) => `${letra}.`).join('');
  if (titulo === '') return siglas;
  if (siglas === '') return titulo;
  return `${siglas} ${titulo}`;
}
