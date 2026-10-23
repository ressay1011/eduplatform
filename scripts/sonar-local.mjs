#!/usr/bin/env node
/**
 * sonar-local.mjs — SonarQube en Docker + escaneo del repo.
 *
 * Uso: pnpm sonar
 *
 * 1. Levanta `eduplatform-sonarqube` (puerto 9000) si no está corriendo.
 * 2. Espera a que el servidor esté UP.
 * 3. Lee SONAR_TOKEN de %USERPROFILE%\.eduplatform\sonar.env.
 * 4. Corre el escáner oficial contra el código y la cobertura LCOV.
 *
 * El token NO se imprime ni se guarda en el repo. La primera vez hay que crear
 * el servidor y el token a mano (el script imprime los pasos).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const contenedor = 'eduplatform-sonarqube';
const puerto = 9000;
const url = `http://localhost:${puerto}`;

function docker(...argumentos) {
  return spawnSync('docker', argumentos, { encoding: 'utf8' });
}

function esperar(ms) {
  return new Promise((listo) => setTimeout(listo, ms));
}

async function estadoServidor() {
  try {
    const respuesta = await fetch(`${url}/api/system/status`, { signal: AbortSignal.timeout(3000) });
    if (!respuesta.ok) return 'ARRANCANDO';
    const datos = await respuesta.json();
    return datos.status ?? 'ARRANCANDO';
  } catch {
    return 'ARRANCANDO';
  }
}

function leerConfig() {
  const ruta = join(homedir(), '.eduplatform', 'sonar.env');
  if (!existsSync(ruta)) return { token: null, host: 'http://localhost:9000' };
  const texto = readFileSync(ruta, 'utf8');
  const valor = (clave, porDefecto) => {
    const linea = texto.split(/\r?\n/).find((fila) => fila.startsWith(`${clave}=`));
    return linea === undefined ? porDefecto : linea.slice(clave.length + 1).trim();
  };
  return {
    token: valor('SONAR_TOKEN', null),
    host: valor('SONAR_HOST_URL', 'http://localhost:9000'),
  };
}

const config = leerConfig();
const esLocal = config.host.includes('localhost') || config.host.includes('127.0.0.1');

if (!esLocal) {
  console.log(`▸ Servidor remoto configurado: ${config.host} (no se levanta Docker local)`);
} else {
  const info = docker('info');
  if (info.status !== 0) {
    console.error('✗ Docker no está corriendo. Arráncalo y vuelve a intentar.');
    process.exit(1);
  }

  const existente = docker('inspect', '-f', '{{.State.Status}}', contenedor);
  if (existente.status !== 0) {
    console.log('▸ Creando el contenedor de SonarQube (la primera vez tarda ~2 min)…');
    const creado = docker(
      'run', '-d', '--name', contenedor,
      '-p', `${puerto}:9000`,
      '-v', 'eduplatform-sonarqube-data:/opt/sonarqube/data',
      '-v', 'eduplatform-sonarqube-logs:/opt/sonarqube/logs',
      '-v', 'eduplatform-sonarqube-extensions:/opt/sonarqube/extensions',
      'sonarqube:community',
    );
    if (creado.status !== 0) {
      console.error('✗ No se pudo crear el contenedor:', creado.stderr?.trim());
      process.exit(1);
    }
  } else if (existente.stdout.trim() !== 'running') {
    console.log('▸ Arrancando el contenedor existente…');
    docker('start', contenedor);
  }

  process.stdout.write('▸ Esperando a SonarQube');
  let estado = 'ARRANCANDO';
  for (let intento = 0; intento < 60; intento += 1) {
    estado = await estadoServidor();
    if (estado === 'UP') break;
    process.stdout.write('.');
    await esperar(4000);
  }
  console.log(` ${estado}`);
  if (estado !== 'UP') {
    console.error('✗ SonarQube no llegó a UP en 4 minutos. Revisa `docker logs ' + contenedor + '`.');
    process.exit(1);
  }
}

const token = config.token;
if (token === null) {
  console.error('\n✗ Falta el token del escáner. Guarda en ' + join(homedir(), '.eduplatform', 'sonar.env') + ':\n');
  console.error('   SONAR_TOKEN=tu_token');
  console.error('   SONAR_HOST_URL=https://sonarcloud.io     # o http://localhost:9000\n');
  console.error('  SonarCloud (repo público, gratis): entra en https://sonarcloud.io con GitHub,');
  console.error('  crea la organización, importa el proyecto y genera un token.');
  console.error('  Local: abre ' + url + ' con admin/admin, cambia la clave y genera el token.');
  process.exit(1);
}

const cobertura = [
  'apps/api/coverage/lcov.info',
  'apps/web/coverage/lcov.info',
  'packages/types/coverage/lcov.info',
  'packages/database/coverage/lcov.info',
].filter((ruta) => existsSync(join(raiz, ruta)));

if (cobertura.length === 0) {
  console.log('⚠ No hay cobertura; corre `pnpm coverage` antes para que Sonar la lea.');
}

console.log('▸ Escaneando el repositorio…');
const escaneo = spawnSync(
  'docker',
  [
    'run', '--rm',
    '-e', `SONAR_HOST_URL=${esLocal ? 'http://host.docker.internal:9000' : config.host}`,
    '-e', `SONAR_TOKEN=${token}`,
    '-v', `${raiz.replace(/\\/g, '/')}:/usr/src`,
    'sonarsource/sonar-scanner-cli',
  ],
  { stdio: 'inherit' },
);

if (escaneo.status !== 0) {
  console.error('✗ El escaneo falló.');
  process.exit(1);
}

console.log(`\n✓ Listo. Abre ${url}/dashboard?id=ressay1011_eduplatform`);
console.log('  (la primera vez crea el proyecto al terminar el escaneo).');