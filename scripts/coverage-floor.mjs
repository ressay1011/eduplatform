#!/usr/bin/env node
/**
 * coverage-floor.mjs — umbral de cobertura que sí se cumple.
 *
 * Lee los `lcov.info` que genera `pnpm coverage` y falla si la cobertura de
 * líneas baja del mínimo acordado. SonarCloud mide lo mismo, pero su "quality
 * gate" por defecto (80 % en código nuevo) no es editable en el plan Free y
 * funciona como aspiración: el freno real está aquí.
 *
 * Uso: pnpm coverage:check
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Mínimos por paquete (líneas). Se suben cuando la cobertura suba de verdad. */
const MINIMOS = {
  'packages/types': 75,
  'packages/database': 25,
  'apps/api': 60,
  'apps/web': 20,
};

/** Mínimo global: evita que un paquete grande baje la media sin que se note. */
const MINIMO_GLOBAL = 40;

function medir(paquete) {
  const ruta = join(raiz, paquete, 'coverage', 'lcov.info');
  if (!existsSync(ruta)) return null;
  const texto = readFileSync(ruta, 'utf8');
  let lineas = 0;
  let cubiertas = 0;
  for (const linea of texto.split('\n')) {
    if (linea.startsWith('LF:')) lineas += Number(linea.slice(3));
    else if (linea.startsWith('LH:')) cubiertas += Number(linea.slice(3));
  }
  if (lineas === 0) return null;
  return { lineas, cubiertas, porcentaje: (cubiertas * 100) / lineas };
}

let totalLineas = 0;
let totalCubiertas = 0;
let fallos = 0;

for (const [paquete, minimo] of Object.entries(MINIMOS)) {
  const dato = medir(paquete);
  if (dato === null) {
    console.log(`⚠ ${paquete}: sin lcov (¿corriste pnpm coverage?)`);
    fallos += 1;
    continue;
  }
  totalLineas += dato.lineas;
  totalCubiertas += dato.cubiertas;
  const ok = dato.porcentaje >= minimo;
  if (!ok) fallos += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${paquete.padEnd(20)} ${dato.porcentaje.toFixed(1).padStart(5)} % ` +
      `(mínimo ${minimo} %) · ${dato.cubiertas}/${dato.lineas} líneas`,
  );
}

const global = totalLineas === 0 ? 0 : (totalCubiertas * 100) / totalLineas;
const globalOk = global >= MINIMO_GLOBAL;
if (!globalOk) fallos += 1;
console.log(
  `${globalOk ? '✓' : '✗'} ${'TOTAL'.padEnd(20)} ${global.toFixed(1).padStart(5)} % ` +
    `(mínimo ${MINIMO_GLOBAL} %)`,
);

if (fallos > 0) {
  console.error(`\n✗ Cobertura por debajo del umbral (${fallos} punto(s)). Añade tests o baja el mínimo a conciencia.`);
  process.exit(1);
}
console.log('\n✓ Cobertura dentro del umbral acordado.');