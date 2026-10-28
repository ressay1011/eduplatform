import type { ReactNode } from 'react';
import { GuardiaAcceso } from '@/components/GuardiaAcceso';

/**
 * Layout del panel: toda página bajo `/dashboard` pasa por la guardia
 * (sesión, contraseña temporal y onboarding pendiente).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <GuardiaAcceso>{children}</GuardiaAcceso>;
}
