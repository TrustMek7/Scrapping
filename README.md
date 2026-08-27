# Scrapping — Monitor de Publicaciones Públicas

Aplicación local de monitoreo de publicaciones públicas: consulta fuentes configuradas (webs, RSS, redes sociales compatibles), detecta menciones a entidades monitoreadas, las analiza con IA (clasificación + resumen neutral) y genera alertas por WhatsApp (SendPulse) y/o email. Todo corre en una sola computadora, sin infraestructura cloud.

> El contexto completo del proyecto (arquitectura, reglas de negocio, estado de implementación, decisiones técnicas) vive en el skill [`.agents/skills/project-context/SKILL.md`](.agents/skills/project-context/SKILL.md). Este README es solo la puesta en marcha rápida.

## Arquitectura

```text
PC LOCAL
│
├── apps/web        React + Vite + TypeScript + Tailwind + shadcn/ui (PWA)
├── apps/backend    NestJS + TypeScript + Prisma (API, scraping, IA, alertas)
├── packages/shared Tipos y contratos compartidos entre web y backend
├── prisma/         Esquema y migraciones de PostgreSQL
└── PostgreSQL      Corriendo en Docker (un único contenedor, sin más servicios)
```

## Requisitos

- Node.js 20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- Docker Desktop (solo se usa para levantar PostgreSQL)

Este proyecto es un **workspace de pnpm**. No uses `npm install` en la raíz: rompe la instalación porque npm no entiende `pnpm-workspace.yaml`.

## Puesta en marcha

```bash
git clone <este-repo>
cd Scrapping

cp .env.example .env      # completar credenciales si aplica (SendPulse, email)

pnpm install               # instala apps/web, apps/backend, packages/shared y raíz
pnpm docker:db:up          # levanta PostgreSQL en Docker (puerto 5433, ver nota abajo)
pnpm db:migrate            # aplica las migraciones de Prisma
```

Luego, en dos terminales separadas:

```bash
pnpm dev:backend   # NestJS en http://localhost:3000 (health check en /health)
pnpm dev:web       # Vite en http://localhost:5173
```

### Nota sobre el puerto de PostgreSQL

El contenedor Docker expone PostgreSQL en el **puerto 5433**, no en el 5432 por defecto, porque muchas máquinas (incluida la de desarrollo original) ya tienen un PostgreSQL nativo instalado ocupando el 5432. Si tu máquina no tiene ese conflicto, puedes cambiar `POSTGRES_PORT` y `DATABASE_URL` en `.env` a 5432 sin problema.

## Scripts disponibles (raíz)

| Script | Descripción |
|---|---|
| `pnpm dev:web` | Levanta el frontend (Vite) |
| `pnpm dev:backend` | Levanta el backend (NestJS, modo watch) |
| `pnpm build` | Compila todos los paquetes del workspace |
| `pnpm lint` | Lint de todos los paquetes |
| `pnpm docker:db:up` / `pnpm docker:db:down` | Levanta/detiene el contenedor de PostgreSQL |
| `pnpm db:migrate` | Aplica migraciones de Prisma (`prisma migrate dev`) |
| `pnpm db:generate` | Regenera el cliente de Prisma |
| `pnpm db:studio` | Abre Prisma Studio para inspeccionar la base de datos |

## Mover el proyecto a otro dispositivo

1. Instalar Node.js 20+, pnpm y Docker Desktop en el nuevo dispositivo.
2. Copiar el repositorio (o `git clone`) y el archivo `.env` (no está versionado).
3. `pnpm install`
4. `pnpm docker:db:up`
5. `pnpm db:migrate`

No se requiere reinstalar ni configurar PostgreSQL manualmente: el contenedor y su volumen recrean la base de datos igual en cualquier equipo con Docker.

## Licencia

`apps/web` parte de la plantilla [TailAdmin React](https://tailadmin.com) (MIT License, ver [LICENSE.md](LICENSE.md)) como base de componentes UI.
