# EduPlatform

SaaS multi-tenant de gestión escolar para colegios públicos colombianos
(práctica profesional — I.E.T.D. Juana Arias de Benavides, Plato, Magdalena).

> Proyecto en construcción **desde cero**, con una regla estricta:
> **cada módulo nace compilando, con tests, y verificado** antes de continuar.

## Stack

- **Frontend:** Next.js 15 (App Router) + React + Tailwind CSS + Material Design 3
- **Backend:** NestJS + Drizzle ORM + PostgreSQL 16 (Row-Level Security)
- **Monorepo:** Turborepo + pnpm workspaces
- **Calidad:** TypeScript strict + Vitest + ESLint + Prettier
- **Deploy:** Vercel (web) + Render (API) + Neon (PostgreSQL)

## Documentación (en `docs/`)

| Documento | Contenido |
|---|---|
| `PLAN.md` | Plan maestro y fases del proyecto |
| `MODELO-DATOS.md` | Modelo de datos multi-tenant (RLS) |
| `NORMATIVA-COLOMBIA.md` | Ley 115, Decreto 1290, D.277/2025, Ley 1581… |
| `DISENO-mapas-flujos.md` | Mapas de flujos por rol |
| `PRINCIPIOS-INGENIERIA.md` | Principios de arquitectura |
| `QA-Y-TESTING.md` | Estrategia de pruebas |
| `TOOLING-AND-STANDARDS.md` | Configuraciones y estándares del stack |
| `adr/` | Registros de decisiones de arquitectura |

El diseño (Figma + referencias) vive en `diseno/`.
Las reglas para el agente de IA que escribe el código están en `AGENTS.md`.

## Quickstart (cuando el esqueleto esté listo)

```bash
pnpm install           # instalar dependencias
docker compose up -d   # PostgreSQL local
pnpm dev               # levantar web + api en paralelo
```

## Estado

🟢 **Fase 0 — Estructura base del monorepo** (en curso).