import { redirect } from 'next/navigation';

/** /dashboard/personas entra por la pestaña Empleados. */
export default function PersonasPage() {
  redirect('/dashboard/personas/empleados');
}