/**
 * Reporter de video: deja **un video por test**, con nombre estable.
 *
 * Playwright graba dentro de `test-results/<test>/video.webm` (se borra al
 * empezar cada corrida) y el nombre lleva sufijos aleatorios. Este reporter
 * copia cada grabación a `pruebas-video/<test>.webm` **sobrescribiendo**: si el
 * test se vuelve a correr, el archivo se reemplaza en vez de acumular copias.
 * Si el test no cambió y se usa `pnpm e2e:changed`, ni siquiera se ejecuta.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const DESTINO = 'pruebas-video';

/** Nombre de archivo estable a partir del título del test. */
function nombreDeArchivo(titulo) {
  return (
    titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'test'
  );
}

export default class ReporterVideo {
  onTestEnd(test, result) {
    const video = result.attachments.find((a) => a.name === 'video');
    if (video?.path === undefined) return;

    mkdirSync(DESTINO, { recursive: true });
    const destino = path.join(DESTINO, `${nombreDeArchivo(test.titlePath().join(' '))}.webm`);
    copyFileSync(video.path, destino);

    const estado = result.status === 'passed' ? 'OK' : result.status.toUpperCase();
    console.log(`  video ${estado}: ${destino}`);
  }
}