# EduPlatform

SaaS multi-tenant de gestión escolar para colegios públicos colombianos
(práctica profesional — I.E.T.D. Juana Arias de Benavides, Plato, Magdalena).

> **Este repositorio es la fuente de despliegue.** Contiene solo lo necesario
> para compilar y ejecutar: `apps/`, `packages/`, lockfile y configuración de
> infraestructura. La documentación, el diseño (Figma/exports), las utilidades de
> arranque local y las reglas para agentes se mantienen fuera del repositorio.

Regla de trabajo: **cada módulo nace compilando, con tests y verificado** antes
de avanzar.

## Arquitectura

```
apps/
  api/            NestJS 11 — API REST (/api), auth propia con sesiones opacas
  web/            Next.js 15 (App Router) + React 19 + Material Design 3
packages/
  types/          Contratos y esquemas Zod compartidos (web ↔ api)
  database/       Esquema Drizzle, cliente Postgres y SQL de RLS/seed
```

- **Multi-tenant por `colegio_id` con RLS de PostgreSQL.** El runtime conecta
  como `app_user` (sujeto a políticas); las migraciones usan `app_migrator`
  (dueño del esquema). La API **aborta al arrancar** si el rol no es `app_user`:
  con el dueño, la RLS quedaría inerte en silencio.
- **Auth propia:** sesión opaca en cookie `httpOnly` (`sha256(token + pepper)`),
  bcrypt 12, guards globales Throttler → Auth → Tenant → Permissions, bloqueo
  anti-diccionario.
- **Roles por colegio:** cada persona tiene un rol que agrupa permisos;
  `usuarios_permisos` es la proyección que leen los guards. El alcance por sede
  (`usuarios.alcance` + `usuarios_sedes`) vive en la asignación, no en el rol.

## Matrículas y onboarding

El wizard `/onboarding` (6 pasos) configura el colegio, agrega personal (paso 4)
e importa estudiantes (paso 5). Una matrícula vincula un estudiante con un curso
del año lectivo vigente (`UNIQUE (anio_lectivo_id, estudiante_id)`); la baja es
lógica (`estado = RETIRADO`), nunca un borrado.

| Método | Ruta                                     | Permiso                  | Uso                                            |
| ------ | ---------------------------------------- | ------------------------ | ---------------------------------------------- |
| GET    | `/matriculas/cursos`                     | `estudiantes.ver`        | cursos resolubles del año                      |
| GET    | `/matriculas?cursoId=&anioLectivoId=&q=` | `estudiantes.ver`        | listado con curso                              |
| POST   | `/matriculas`                            | `matriculas.administrar` | alta individual                                |
| POST   | `/matriculas/importar`                   | `matriculas.administrar` | CSV → `{ creadas, errores[{ fila, motivo }] }` |
| DELETE | `/matriculas/:id`                        | `matriculas.administrar` | baja lógica (RETIRADO)                         |

CSV del paso 5 (UTF-8, separado por comas; el encabezado es opcional):

```csv
documento,nombres,apellidos,correo,sede,grado,letra,jornada,fechaNacimiento
1098765432,Ana María,Gómez Ruiz,ana@cole.edu.co,Sede Principal,6,A,Mañana,2013-04-18
```

- `grado` acepta `6`, `6°` o `Transición`; `jornada` acepta `Mañana`, `Tarde`,
  `Noche`, `Única` o `Sabatina`.
- `fechaNacimiento` es opcional, salvo cuando la cuenta existe pero todavía no
  tiene ficha `estudiantes`: en ese caso es obligatoria.
- La importación **no crea cuentas**: un documento inexistente se reporta con un
  error explícito por fila. Las cuentas de estudiante se crean desde Usuarios con
  el rol Estudiante (el alta masiva llega con su módulo).

## Requisitos

- Node.js 22 y pnpm 9.12 (`corepack enable`)
- PostgreSQL 16+ (local con Docker, o Neon en la nube)

## Configuración

Copia los ejemplos y completa los valores:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

| Variable              | Dónde                 | Notas                                                                                      |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | `apps/api/.env`       | Rol **`app_user`** (RLS activa)                                                            |
| `TOKEN_PEPPER`        | `apps/api/.env`       | ≥16 caracteres; `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CORS_ORIGINS`        | `apps/api/.env`       | Origen exacto de la web, sin barra final                                                   |
| `COOKIE_SAMESITE`     | `apps/api/.env`       | `lax` con dominio propio; `none` si web y API están en dominios distintos (exige HTTPS)    |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env.local` | Incluye `/api`; se fija en **build**                                                       |

## Puesta en marcha

```bash
corepack enable
pnpm install

docker compose create && docker compose start   # PostgreSQL local (roles de desarrollo)

# Base de datos: esquema + RLS + catálogo de permisos
pnpm --filter @eduplatform/database run db:push
pnpm --filter @eduplatform/database run db:rls

# Paquetes compartidos primero (las apps los consumen desde dist/)
pnpm --filter @eduplatform/types run build
pnpm --filter @eduplatform/database run build

# API y web
pnpm --filter @eduplatform/api run dev     # http://localhost:4000/api
pnpm --filter @eduplatform/web run dev     # http://localhost:3000
```

## Calidad

```bash
pnpm --filter @eduplatform/api run typecheck && pnpm --filter @eduplatform/api run test
pnpm --filter @eduplatform/web run typecheck && pnpm --filter @eduplatform/web run test
pnpm --filter @eduplatform/database run test
```

## Base de datos y despliegue

**Producción actual:** web en `https://eduplatform-ivory.vercel.app` (Vercel,
root `apps/web`, deploy automático desde `main`) y API en
`https://eduplatform-api-0yrs.onrender.com` (Render free, Virginia, health
`/api/health`) sobre PostgreSQL en Neon (`aws-us-east-1`).

```bash
# Bootstrap de Neon (crea app_migrator/app_user y la base; imprime las URLs)
NEON_OWNER_URL='postgresql://...' pnpm --filter @eduplatform/database run db:neon

# Datos mínimos del entorno desplegado (colegio + sede + admin)
DEMO_HASH='<bcrypt>' DATABASE_URL='postgresql://app_migrator:...' \
  pnpm --filter @eduplatform/database run db:seed

# Verifica que la RLS está activa y aísla (0 filas sin tenant, N con tenant)
DATABASE_URL='postgresql://app_user:...' TENANT_ID='<uuid>' \
  pnpm --filter @eduplatform/database run db:verify

# Auditoría de roles, privilegios y RLS (falla con código 1 si algo se sale del patrón)
DATABASE_URL='postgresql://app_user:...' \
  pnpm --filter @eduplatform/database run db:audit
```

`db:audit` revisa 88 comprobaciones sin modificar nada: roles sin superusuario,
`BYPASSRLS`, `CREATEDB` ni `CREATEROLE`; RLS y política en cada tabla con
`colegio_id`; propiedad de las tablas; privilegios de `app_user` (lectura y DML
sí, DDL no); default ACL para tablas nuevas; funciones `SECURITY DEFINER`; y que
las vistas pre-tenant existan sin exponer `password_hash`. Conviene correrlo
después de cada migración y antes de un despliegue.

- **API → Render:** `render.yaml` (Blueprint) declara el servicio `eduplatform-api`
  (free, Virginia, health `/api/health`), el comando de build del monorepo y el
  de arranque. Los secretos (`DATABASE_URL`, `TOKEN_PEPPER`, `CORS_ORIGINS`) se
  cargan en el dashboard, nunca en el repo.
- **Web → Vercel:** definir `NEXT_PUBLIC_API_URL` en el build. La CSP de
  `next.config.ts` toma el **origen** de esa URL para `connect-src`.
- **BD → Neon:** usar el endpoint directo (sin `-pooler`) hasta validar
  `SET LOCAL` contra el pooler.

## Estado

Implementado y verificado: monorepo, RLS multi-tenant, auth propia (login
unificado por dominio del correo), dashboard del admin, módulo **Personas**
(Empleados · Estudiantes · Acudientes · Roles) con roles por colegio y alcance
por sede, **onboarding de 6 pasos** (personal en el paso 4) y **matrículas**
(API + importación CSV en el paso 5; el curso de cada estudiante se ve en
Personas).

Pendiente: dashboards por rol (docente, estudiante, acudiente), alta masiva de
cuentas de estudiante/acudiente y el resto de las mejoras de rendimiento del
informe interno.
