## Qué cambia

<!-- Una o dos frases: qué problema resuelve y qué módulo toca. -->

## Tipo

- [ ] `feat` — funcionalidad nueva
- [ ] `fix` — corrección
- [ ] `refactor` / `perf`
- [ ] `chore` / `build` / `ci`
- [ ] `docs`

## Checklist obligatorio (no marcar sin haberlo corrido)

- [ ] Rama de trabajo (`dev`, `feat/*` o `fix/*`), **nunca** commit directo a `main`
- [ ] `pnpm preflight` en verde (formato, lint, tipos, tests y build)
- [ ] Si toca la API: tokens de arranque verificados con curl (`/api/health` + el endpoint nuevo)
- [ ] Si toca la BD: `db:push` + `db:rls` aplicados en local y prueba de dos tenants sin fugas
- [ ] Si toca UI: revisado a 1440×900 contra el frame del Figma (medidas del export JSON)
- [ ] Sin `.env`, claves ni secretos en el diff
- [ ] `.env.example` actualizado si hay variables nuevas
- [ ] Migraciones/seed idempotentes si aplica

## Cómo probarlo

<!-- Pasos concretos para que otra persona lo verifique (credenciales demo, URL, clics). -->

## Evidencia

<!-- Salida real: tests (n/m), curl, capturas o medidas. Nada de "debería funcionar". -->

## Riesgo y reversión

<!-- Qué puede romper, cómo se detecta y cómo se revierte (flag, migración inversa, redeploy del commit anterior). -->
