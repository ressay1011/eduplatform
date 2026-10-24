/**
 * Raíz — por ahora redirige al login.
 * (El landing público "tu colegio está en <subdominio>..." llega en otra
 * iteración, cuando exista el dominio real de producción.)
 */
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}
