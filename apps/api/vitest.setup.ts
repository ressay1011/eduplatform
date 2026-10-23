/**
 * Env de TESTS (antes del parse de config/env):
 * límites de throttling altos para que los e2e de auth (varios logins)
 * no choquen con el rate limiter; el límite real se prueba en su propio spec
 * (src/shared/__tests__/throttler.spec.ts) con un módulo aislado.
 */
process.env['THROTTLE_LIMIT'] = '100000';
process.env['THROTTLE_LOGIN_LIMIT'] = '100000';