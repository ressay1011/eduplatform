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

El wizard `/onboarding` (**7 pasos**) deja un colegio operativo:

| Paso | Qué configura                                                    |
| ---- | ---------------------------------------------------------------- |
| 1    | Identidad: código DANE, nombre, NIT, contacto, calendario        |
| 2    | Calendario escolar, año lectivo y períodos académicos            |
| 3    | Sedes y jornadas (varias por colegio, cada una con su ubicación) |
| 4    | Estructura: cursos por sede y jornada (grados × letras)          |
| 5    | Personal: alta rápida con rol y alcance                          |
| 6    | Estudiantes: importación CSV                                     |
| 7    | Resumen y cierre                                                 |

El paso 1 empieza por el **código DANE**: al llegar a los 12 dígitos se consulta
el MEN (datos.gov.co) y se propone nombre, nombre oficial, municipio, dirección,
teléfono, correo, calendario y tamaño. Se consultan dos datasets: el de
establecimientos (`cfw5-qzt5`) y el de jornadas (`emd6-ef7x`), porque el primero
no las publica. Esas jornadas (Mañana, Tarde, Completa, Única, Noche, Fin de
semana) se guardan en el colegio y aparecen premarcadas en el paso 3. Los datos
del MEN vienen sucios a veces: si el teléfono trae dos (`7422210/7422215`) se
queda el primero, y del campo de correo se toma la primera dirección válida. El
código inexistente **no bloquea**: se puede escribir el colegio a mano.

El login es **`usuario@codigo`** (por ejemplo `admin@juanaarias`); el dominio del
correo no identifica al colegio y no se edita en el wizard (ADR-006).

En el paso 3 se pueden **crear y eliminar sedes**: cada una lleva nombre,
dirección, municipio y departamento propios (una IE puede tener una sede en el
municipio vecino) y las jornadas que ofrece. La primera se propone como
«Principal» con la dirección del paso 1; las nuevas empiezan con la dirección
vacía. La API no deja borrar la última sede ni una que ya tenga cursos.

| Método | Ruta                       | Permiso                | Uso                                               |
| ------ | -------------------------- | ---------------------- | ------------------------------------------------- |
| GET    | `/onboarding`              | `configuracion.editar` | estado completo del wizard                        |
| GET    | `/onboarding/dane/:codigo` | `configuracion.editar` | datos del MEN + jornadas del establecimiento      |
| PATCH  | `/onboarding/colegio`      | `configuracion.editar` | identidad, calendario, año y períodos             |
| PUT    | `/onboarding/sedes`        | `configuracion.editar` | alta o edición de una sede                        |
| DELETE | `/onboarding/sedes/:id`    | `configuracion.editar` | baja lógica (nunca la última ni con cursos)       |
| POST   | `/onboarding/estructura`   | `configuracion.editar` | genera los cursos de sede × jornada               |
| PATCH  | `/onboarding/paso`         | `configuracion.editar` | guarda el avance (reanudar donde quedó)           |
| POST   | `/onboarding/finalizar`    | `configuracion.editar` | cierra el wizard (exige sede con jornada y curso) |

Una matrícula vincula un estudiante con un curso del año lectivo vigente
(`UNIQUE (anio_lectivo_id, estudiante_id)`); la baja es lógica
(`estado = RETIRADO`), nunca un borrado.

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
  `Completa`, `Noche`, `Única`, `Sabatina` o `Fin de semana` (también sin
  tildes y en mayúsculas).
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
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/database/.env.example packages/database/.env
```

| Variable              | Dónde                    | Notas                                                                                       |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | `apps/api/.env`          | Rol **`app_user`** (RLS activa)                                                             |
| `TOKEN_PEPPER`        | `apps/api/.env`          | ≥16 caracteres; `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`  |
| `CORS_ORIGINS`        | `apps/api/.env`          | Origen exacto de la web, sin barra final                                                    |
| `COOKIE_SAMESITE`     | `apps/api/.env`          | `lax` con dominio propio; `none` si web y API están en dominios distintos (exige HTTPS)     |
| `DATOS_GOV_APP_TOKEN` | `apps/api/.env`          | Opcional. App token de datos.gov.co: cupo propio (1.000 req/h) al consultar por código DANE |
| `DATABASE_URL`        | `packages/database/.env` | Rol **`app_migrator`** (dueño del esquema; drizzle-kit y los scripts de `db:*`)             |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env.local`    | Incluye `/api`; se fija en **build**                                                        |

## Entornos

|            | Rama   | API                            | Web                            | Base de datos              |
| ---------- | ------ | ------------------------------ | ------------------------------ | -------------------------- |
| Producción | `main` | `eduplatform-api` (Render)     | `eduplatform-ivory.vercel.app` | Neon `main`                |
| Pruebas    | `dev`  | `eduplatform-api-dev` (Render) | preview de Vercel de la rama   | rama `dev` de Neon (copia) |

- **`main` solo se actualiza por PR desde `dev` y con autorización explícita**; un push a `main` despliega solo.
- Cada push a `dev` despliega la API de pruebas y crea un preview de la web que apunta a esa API
  (`NEXT_PUBLIC_API_URL` del entorno _Preview_). La web del preview exige sesión de Vercel.
- `CORS_ORIGINS` de la API de pruebas acepta `https://eduplatform-*-<equipo>.vercel.app`, así que
  cualquier preview funciona sin tocar la variable; en producción los orígenes son exactos.

## Probar la producción

La base de `main` tiene un colegio de prueba para revisar la app desplegada sin
tocar datos reales:

| Qué     | Valor                                           |
| ------- | ----------------------------------------------- |
| Web     | `https://eduplatform-ivory.vercel.app`          |
| API     | `https://eduplatform-api-0yrs.onrender.com/api` |
| Colegio | `prueba`                                        |
| Usuario | `admin@prueba`                                  |

La contraseña temporal **no vive en el repositorio**: se entrega aparte y el
primer ingreso obliga a cambiarla. Para crear otro colegio de prueba:

```bash
MIGRATOR_URL='postgresql://...' \
  pnpm --filter @eduplatform/database run db:colegio prueba2 --nombre "Colegio de Prueba"
# imprime los roles base y deja la contraseña temporal en ~/.eduplatform/admin-prueba2.txt
```

El colegio nace vacío (sin sede): al entrar, el wizard arranca en el paso 1 y se
puede recorrer completo con datos inventados.

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

`db:audit` revisa 58 comprobaciones sin modificar nada: roles sin superusuario,
`BYPASSRLS`, `CREATEDB` ni `CREATEROLE`; por cada tabla con `colegio_id`, RLS,
política que filtre por `colegio_id` y `WITH CHECK` que valide el tenant al
escribir (sin él se podría insertar en el colegio de otro); ninguna política sin
condición (`USING (true)` o `colegio_id IS NULL` fallan); propiedad de las
tablas; privilegios de `app_user` (lectura y DML sí, DDL no); default ACL para
tablas nuevas; funciones `SECURITY DEFINER`; y que las vistas pre-tenant existan
sin exponer `password_hash`. El **paso 8 de `pnpm preflight`** lo corre con el
`DATABASE_URL` de `apps/api/.env` (se salta solo si esa base no está
configurada), así que no se sube una rama con el patrón de seguridad roto.

- **API → Render:** `render.yaml` (Blueprint) declara el servicio `eduplatform-api`
  (free, Virginia, health `/api/health`), el comando de build del monorepo y el
  de arranque. Los secretos (`DATABASE_URL`, `TOKEN_PEPPER`, `CORS_ORIGINS`) se
  cargan en el dashboard, nunca en el repo.
- **Web → Vercel:** definir `NEXT_PUBLIC_API_URL` en el build. La CSP de
  `next.config.ts` toma el **origen** de esa URL para `connect-src`.
- **BD → Neon:** usar el endpoint directo (sin `-pooler`) hasta validar
  `SET LOCAL` contra el pooler.

## Estado

Implementado y verificado: monorepo, RLS multi-tenant, auth propia (acceso
`usuario@codigo`), dashboard del admin, módulo **Personas** (Empleados ·
Estudiantes · Acudientes · Roles) con roles por colegio y alcance por sede,
**onboarding de 7 pasos** (calendario con períodos validados al elegirlos,
varias sedes con su ubicación, estructura, personal y CSV de estudiantes) y
**matrículas** (API + importación CSV; el curso de cada estudiante se ve en
Personas). La marca del colegio se genera en CIELAB a partir de sus tres colores
semilla y se aplica antes del primer pintado (14 roles M3), con favicon propio.

Pendiente: dashboards por rol (docente, estudiante, acudiente), alta masiva de
cuentas de estudiante/acudiente y el resto de las mejoras de rendimiento del
informe interno.
