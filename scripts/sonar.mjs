#!/usr/bin/env node
/**
 * sonar.mjs — análisis estático con el escáner oficial de Sonar (sin Docker).
 *
 * Uso: pnpm sonar   (antes: pnpm coverage, para que haya LCOV)
 *
 * Lee el token y el servidor de `%USERPROFILE%\.eduplatform\sonar.env`:
 *   SONAR_TOKEN=...
 *   SONAR_HOST_URL=https://sonarcloud.io
 *
 * Requiere Java 17+ en el PATH (el escáner lo usa por debajo); en esta máquina
 * hay OpenJDK 25. El token nunca se imprime ni se escribe en el repo.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const proyecto = 'ressay1011_eduplatform';

function leerConfig() {
  const ruta = join(homedir(), '.eduplatform', 'sonar.env');
  if (!existsSync(ruta)) return { token: null, host: 'https://sonarcloud.io' };
  const texto = readFileSync(ruta, 'utf8');
  const valor = (clave, porDefecto) => {
    const linea = texto.split(/\r?\n/).find((fila) => fila.startsWith(`${clave}=`));
    return linea === undefined ? porDefecto : linea.slice(clave.length + 1).trim();
  };
  return {
    token: valor('SONAR_TOKEN', null),
    host: valor('SONAR_HOST_URL', 'https://sonarcloud.io'),
  };
}

const { token, host } = leerConfig();

if (token === null) {
  console.error('✗ Falta SONAR_TOKEN en ' + join(homedir(), '.eduplatform', 'sonar.env'));
  console.error('  SonarCloud: https://sonarcloud.io/account/security → Generate Tokens');
  process.exit(1);
}

const java = spawnSync('java', ['-version'], { encoding: 'utf8' }); // NOSONAR: script de desarrollo, comando fijo
if (java.status !== 0) {
  console.error('✗ El escáner necesita Java 17+ en el PATH (no lo encontré).');
  process.exit(1);
}

const cobertura = [
  'apps/api/coverage/lcov.info',
  'apps/web/coverage/lcov.info',
  'packages/types/coverage/lcov.info',
  'packages/database/coverage/lcov.info',
].filter((ruta) => existsSync(join(raiz, ruta)));

if (cobertura.length === 0) {
  console.log('⚠ No hay cobertura todavía; corre `pnpm coverage` para que Sonar la mida.');
}

console.log(`▸ Escaneando con ${host} (Java: ${(java.stderr.split('\n')[0] ?? '').replace('openjdk version ', '')})…`);

const escaneo = spawnSync('pnpm exec sonar-scanner-npm', { // NOSONAR: idem, comando fijo
  cwd: raiz,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, SONAR_TOKEN: token, SONAR_HOST_URL: host },
});

if (escaneo.status !== 0) {
  console.error('✗ El escaneo falló. Revisa el mensaje anterior.');
  process.exit(1);
}

console.log(`\n✓ Listo: ${host}/dashboard?id=${proyecto}`);