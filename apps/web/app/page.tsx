/**
 * Raíz — por ahora redirige al login.
 * (El landing público llega en otra iteración.)
 */
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}
