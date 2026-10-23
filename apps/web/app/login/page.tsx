import { Suspense } from 'react';
import { LoginFlow } from '@/components/login/LoginFlow';

/**
 * Página de login — el flujo interactivo vive en LoginFlow (client).
 * Suspense es requerido por useSearchParams en el App Router.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginFlow />
    </Suspense>
  );
}
