#!/usr/bin/env node
/**
 * preflight.mjs — checklist OBLIGATORIO antes de subir código.
 *
 * Uso:
 *   pnpm preflight          # checklist completo (incluye build)
 *   pnpm preflight:fast     # sin build (para iterar)
 *   node scripts/preflight.mjs --allow-main   # solo emergencias documentadas
 *
 * Regla del proyecto: el código NO va directo a producción. Se trabaja en
 * `dev` (o en una rama `feat/...`/`fix/...` que sale de `dev`), se pasa este
 * checklist y solo entonces se abre PR; `main` despliega a Render y Vercel.
 *
 * Sale con código 1 si algo falla: así el hook/CI/terminal frenan el push.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const argumentos = new Set(process.argv.slice(2));
const soloRapido = argumentos.has('--fast') || argumentos.has('--rapido');
const permitirMain = argumentos.has('--allow-main');

const resultados = [];

/** Ejecuta un comando mostrando su salida; devuelve true si terminó en 0. */
function correr(etiqueta, comando, opciones = {}) {
  const inicio = Date.now();
  const resultado = spawnSync(comando, {
    cwd: raiz,
    shell: true,
    stdio: opciones.silencioso === true ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...(opciones.env ?? {}) },
  });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  const ok = resultado.status === 0;
  resultados.push({ etiqueta, ok, segundos, detalle: opciones.detalle });
  if (!ok && opciones.mostrarSalida === true) {
    process.stdout.write(resultado.stdout ?? '');
    process.stderr.write(resultado.stderr ?? '');
  }
  return ok;
}

/** Ejecuta `git` y devuelve la salida recortada. */
function git(...partes) {
  const resultado = spawnSync('git', partes, { cwd: raiz, encoding: 'utf8' }); // NOSONAR: script de desarrollo, comando fijo sin entrada de usuario
  return (resultado.stdout ?? '').trim();
}

/** Lee una variable de un archivo .env sin cargarlo entero en el proceso. */
function leerVariable(archivo, clave) {
  if (!existsSync(archivo)) return null;
  const lineas = readFileSync(archivo, 'utf8').split(/\r?\n/);
  const linea = lineas.find((fila) => fila.startsWith(`${clave}=`));
  if (linea === undefined) return null;
  const valor = linea
    .slice(clave.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
  return valor === '' ? null : valor;
}

function titulo(texto) {
  console.log(`\n\u001b[1m${texto}\u001b[0m`);
}

// ── 1. Rama de trabajo ────────────────────────────────────────────────────────
titulo('1. Rama de trabajo');
const rama = git('rev-parse', '--abbrev-ref', 'HEAD');
const ramaOk = rama !== 'main' || permitirMain;
resultados.push({
  etiqueta: `rama actual: ${rama}${permitirMain ? ' (--allow-main)' : ''}`,
  ok: ramaOk,
  segundos: '0.0',
  detalle: ramaOk
    ? undefined
    : 'trabaja en dev o en una rama feat/* / fix/*; main despliega a producción',
});

// ── 2. Árbol limpio ───────────────────────────────────────────────────────────
titulo('2. Árbol de trabajo');
const pendientes = git('status', '--porcelain');
const limpio = pendientes === '';
resultados.push({
  etiqueta: limpio ? 'sin cambios sin commitear' : 'hay cambios sin commitear',
  ok: limpio,
  segundos: '0.0',
  detalle: limpio ? undefined : `commitear o descartar antes de subir:\n${pendientes}`,
});

// ── 3. Secretos fuera del índice ──────────────────────────────────────────────
titulo('3. Secretos');
const rastreados = git('ls-files').split('\n').filter(Boolean);
const sospechosos = rastreados.filter(
  (archivo) =>
    /(^|\/)\.env(\.|$)/.test(archivo) &&
    !archivo.endsWith('.env.example') &&
    !archivo.includes('.env.local.example'),
);
const secretosOk = sospechosos.length === 0;
resultados.push({
  etiqueta: secretosOk
    ? 'ningún .env versionado'
    : `archivos .env versionados: ${sospechosos.join(', ')}`,
  ok: secretosOk,
  segundos: '0.0',
  detalle: secretosOk
    ? undefined
    : 'quitar del índice con `git rm --cached` y añadirlos a .gitignore',
});

const claves = rastreados.filter((archivo) => /\.(pem|key|p12|pfx)$/.test(archivo));
resultados.push({
  etiqueta:
    claves.length === 0
      ? 'sin claves privadas versionadas'
      : `claves versionadas: ${claves.join(', ')}`,
  ok: claves.length === 0,
  segundos: '0.0',
});

// ── 4. Dependencias declaradas ────────────────────────────────────────────────
titulo('4. Dependencias');
const lockfile = existsSync(join(raiz, 'pnpm-lock.yaml'));
const instaladas = existsSync(join(raiz, 'node_modules'));
resultados.push({
  etiqueta: lockfile ? 'pnpm-lock.yaml presente' : 'falta pnpm-lock.yaml',
  ok: lockfile,
  segundos: '0.0',
});
resultados.push({
  etiqueta: instaladas ? 'node_modules instalado' : 'falta `pnpm install`',
  ok: instaladas,
  segundos: '0.0',
  detalle: instaladas ? undefined : 'ejecuta pnpm install antes del preflight',
});

// ── 5. Calidad ────────────────────────────────────────────────────────────────
titulo('5. Formato, lint, tipos y tests');
correr('formato (prettier --check)', 'pnpm format:check');
correr('lint (eslint)', 'pnpm lint');
correr('tipos (tsc --noEmit en todo el monorepo)', 'pnpm typecheck');
correr('tipos (e2e / Playwright)', 'pnpm e2e:types');
correr('tests (vitest de todos los paquetes)', 'pnpm test');

// ── 6. Build ──────────────────────────────────────────────────────────────────
if (soloRapido) {
  resultados.push({
    etiqueta: 'build omitido (--fast)',
    ok: true,
    segundos: '0.0',
    detalle: 'el build completo lo corre el CI; no uses --fast antes de un PR',
  });
} else {
  titulo('6. Build');
  correr('build (turbo: paquetes + api + web)', 'pnpm build', {
    env: { NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'http://localhost:4000/api' },
  });
}

// ── 7. Auditoría de dependencias (aviso, no bloquea) ──────────────────────────
titulo('7. Auditoría de dependencias');
const ORDEN_AUDIT = 'pnpm audit --prod --audit-level=high';
const auditoria = spawnSync(ORDEN_AUDIT, {
  // NOSONAR: script de desarrollo, comando fijo sin entrada de usuario
  cwd: raiz,
  shell: true,
  encoding: 'utf8',
});
resultados.push({
  etiqueta:
    auditoria.status === 0
      ? 'sin vulnerabilidades altas en producción'
      : 'auditoría reportó hallazgos (revisar; no bloquea)',
  ok: true,
  segundos: '0.0',
  detalle:
    auditoria.status === 0 ? undefined : (auditoria.stdout ?? '').split('\n').slice(-4).join('\n'),
});

// ── 8. Auditoría de la base (roles, privilegios y RLS) ───────────────────────
titulo('8. Auditoría de la base');
const urlBase = leerVariable(join(raiz, 'apps/api/.env'), 'DATABASE_URL');
if (urlBase === null) {
  resultados.push({
    etiqueta: 'auditoría de la base omitida (sin DATABASE_URL en apps/api/.env)',
    ok: true,
    segundos: '0.0',
    detalle: 'con la base configurada, `db:audit` comprueba roles, privilegios y RLS',
  });
} else {
  const inicioAuditoria = Date.now();
  const auditoriaBase = spawnSync(
    process.execPath,
    ['packages/database/scripts/audit-seguridad.mjs'],
    {
      cwd: raiz,
      shell: false,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: urlBase },
    },
  );
  const segundos = ((Date.now() - inicioAuditoria) / 1000).toFixed(1);
  const okAuditoria = auditoriaBase.status === 0;
  const hallazgos = (auditoriaBase.stdout ?? '')
    .split('\n')
    .filter((linea) => linea.startsWith('XX'))
    .join('\n');
  resultados.push({
    etiqueta: okAuditoria
      ? 'roles, privilegios y RLS en su sitio (db:audit)'
      : 'db:audit encontró fallos de seguridad',
    ok: okAuditoria,
    segundos,
    detalle: okAuditoria
      ? undefined
      : hallazgos !== ''
        ? hallazgos
        : (auditoriaBase.stderr ?? '').split('\n').slice(-4).join('\n'),
  });
}

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(72));
let fallos = 0;
for (const resultado of resultados) {
  const marca = resultado.ok ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✗\u001b[0m';
  console.log(`${marca} ${resultado.etiqueta} \u001b[90m(${resultado.segundos}s)\u001b[0m`);
  if (!resultado.ok) {
    fallos += 1;
    if (resultado.detalle !== undefined)
      console.log(`   \u001b[31m→ ${resultado.detalle}\u001b[0m`);
  }
}
console.log('─'.repeat(72));

if (fallos > 0) {
  console.log(`\u001b[31m\u001b[1mPREFLIGHT FALLÓ: ${fallos} punto(s). No subir.\u001b[0m`);
  process.exit(1);
}

console.log(`\u001b[32m\u001b[1mPREFLIGHT OK\u001b[0m — puedes commitear y subir ${rama}.`);
console.log(
  '\u001b[90mSiguiente paso: push a dev (o rama feat/*) y PR; main solo por PR con CI verde.\u001b[0m',
);
