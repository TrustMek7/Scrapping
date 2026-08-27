---
name: project-context
description: Contexto del proyecto Scrapping (monitor local de publicaciones públicas) — arquitectura implementada, modelo de datos, reglas de negocio invariables, restricciones tecnológicas y estado actual. Usar antes de tocar código, diseñar features nuevas, o decidir dónde/cómo encaja algo en este repo.
---

# Contexto: Scrapping — Monitor de publicaciones públicas

## Qué es

Aplicación local que monitorea fuentes públicas (webs, RSS, redes sociales compatibles),
detecta publicaciones que mencionan entidades configuradas por el usuario, las analiza con
IA (clasificación + resumen neutral) y genera alertas por WhatsApp (SendPulse) y opcionalmente
email. Corre completa en una sola computadora, sin infraestructura cloud.

Principio rector: es un **monitor de información pública**, no un sistema que determina la
veracidad de acusaciones. El flujo conceptual es:

```text
Detectar → Contextualizar → Clasificar → Resumir → Alertar → Revisión humana de la fuente original
```

## Arquitectura implementada

Monorepo con pnpm workspaces:

```text
Scrapping/
├── apps/
│   ├── web/            React + Vite + TypeScript + Tailwind + shadcn/ui (PWA)
│   └── backend/        NestJS + TypeScript + Prisma
├── packages/
│   └── shared/         Tipos compartidos (analysis.ts, source.ts)
├── prisma/
│   └── schema.prisma   Modelos + migraciones
├── docker-compose.yml  Un único servicio: postgres
├── .env / .env.example
└── pnpm-workspace.yaml
```

- **apps/web** es la plantilla TailAdmin React reubicada tal cual (antes vivía en la raíz del
  repo). El paquete se llama `web` (no `tailadmin-react`) para que los filtros de pnpm
  (`pnpm --filter web ...`) funcionen.
- **apps/backend** expone por ahora un único endpoint `GET /health` que además verifica la
  conexión a PostgreSQL vía `PrismaService` (`apps/backend/src/prisma/`). `PrismaModule` es
  `@Global()`.
- **packages/shared** exporta tipos (no lógica): `ContentCategory`, `Severity`, `ClaimType`,
  `AnalysisResult`, `SourceType`, `SourceStatus`. Se compila a `dist/` (`tsc`) — tanto backend
  como web lo consumen como `@scrapping/shared` vía `workspace:*`.
- **Prisma** vive en la raíz (`prisma/schema.prisma`, no dentro de `apps/backend`), tal como
  indica la estructura de referencia. `@prisma/client` y `prisma` están instalados en el
  `package.json` raíz (no en `apps/backend`): la resolución funciona porque Node camina hacia
  arriba en `node_modules` hasta encontrarlos en la raíz. No dupliques esta dependencia dentro
  de `apps/backend` — causaría versiones desincronizadas.

## Base de datos

PostgreSQL corre **solo en Docker** (`docker-compose.yml`, un único servicio `postgres`,
imagen `postgres:16-alpine`, volumen persistente `postgres_data`). El resto del stack
(backend, frontend, scraper, IA) corre nativo con pnpm — no hay Dockerfile para la app.

**Puerto 5433, no 5432.** La máquina donde se creó este proyecto ya tenía un PostgreSQL nativo
de Windows (`postgres.exe`) escuchando en el 5432; el contenedor se expuso en 5433 para evitar
el choque. Si migras a una máquina sin ese conflicto, puedes volver a 5432 en `.env`, pero no
asumas que 5432 está libre sin comprobarlo primero (`netstat`/`Get-NetTCPConnection` en
Windows).

Se eligió Docker (en vez de un PostgreSQL nativo instalado directamente) específicamente para
que el proyecto sea portable al moverlo a otro dispositivo: mismo `docker-compose up`, misma
versión, sin reconfigurar nada a mano.

Comandos: `pnpm docker:db:up`, `pnpm docker:db:down`, `pnpm db:migrate`, `pnpm db:generate`,
`pnpm db:studio`.

## Modelo de datos (prisma/schema.prisma)

```text
Source
 └── Publication
MonitoredEntity
 └── PublicationEntity
       └── Publication
Publication
 └── Analysis
Analysis
 └── Alert
Alert
 └── Notification
```

Enums ya definidos: `SourceType` (WEBSITE, RSS, FACEBOOK, INSTAGRAM, OTHER), `SourceStatus`
(ACTIVE, ERROR, DISABLED), `ContentCategory` (POSITIVE, NEUTRAL, CRITICISM, COMPLAINT,
ALLEGATION, DENUNCIA, SCANDAL, OTHER_RELEVANT, IRRELEVANT), `Severity` (LOW, MEDIUM, HIGH),
`ClaimType` (FACT, REPORTED_CLAIM, OPINION, ALLEGATION, DENIAL, UNVERIFIED),
`AnalysisStatus` (PENDING, COMPLETED, FAILED), `NotificationChannel` (WHATSAPP, EMAIL),
`NotificationStatus` (PENDING, SENT, FAILED).

Deduplicación de publicaciones: `contentHash` es único; `(sourceId, externalId)` también.
Prioridad para identificar duplicados: ID externo de la plataforma → URL canónica → hash.
Una publicación duplicada nunca debe generar una alerta nueva.

## Reglas de negocio invariables

Estas reglas no son detalles de implementación de una etapa: son restricciones de producto
que cualquier feature nueva debe respetar.

1. **La IA no es fuente de verdad.** La publicación original es la fuente; la IA interpreta.
   Nunca convertir una acusación reportada en un hecho afirmado. Ejemplo correcto: "El medio X
   informa sobre una acusación de corrupción contra el candidato" — no "El candidato cometió
   corrupción".
2. **La IA nunca decide ni envía alertas directamente.** Devuelve una estructura validada
   (`AnalysisResult` en `packages/shared/src/analysis.ts`); el backend valida (Zod o
   equivalente) y decide con reglas explícitas y umbrales configurables si corresponde alerta.
   Si la salida no cumple el esquema, se registra el error y NO se genera alerta con datos
   inválidos.
3. **Categorías y tipos de afirmación son cerrados** (ver enums arriba). No inferir
   categoría por keyword-matching simple (`if text.includes("corrupción")`); el contexto es
   obligatorio, las palabras clave son señal auxiliar como mucho.
4. **La IA es un componente independiente del backend**, con flujo
   `Controller → AnalysisService → AIProvider → StructuredOutput → Schema Validation → Analysis`.
   El proveedor de IA debe quedar abstraído para poder cambiar de modelo sin tocar el resto.
5. **El backend decide cuándo llamar a `NotificationService`**, nunca la IA. Canales
   (`WhatsAppNotificationService`, `EmailNotificationService`) implementan una interfaz común.
6. **WhatsApp vía SendPulse a un único número configurado.** Nada de mensajería masiva.
7. **El fallo de una fuente no debe detener el sistema.** Cada `Source` tiene estado
   (`ACTIVE`/`ERROR`/`DISABLED`) y registra último error, última ejecución, última publicación.
8. **Nunca implementar evasión de anti-bot** (CAPTCHA, rate limits, bloqueos, auth) para
   Facebook/Instagram u otra fuente. Si una fuente no se puede consultar de forma permitida,
   se registra el error y se muestra en el dashboard — no se busca un rodeo técnico.
9. **La publicación original (título, contenido, URL, fuente, fecha) siempre se conserva**
   junto a cualquier resumen o análisis derivado.

## Restricciones tecnológicas vigentes

No introducir sin necesidad real y explícita: Supabase, Firebase, SQLite, MongoDB, Vercel,
AWS/GCP/Azure, Kubernetes, Nx, Turborepo, microservicios, Redis, BullMQ. Docker se usa
**únicamente** para el contenedor de PostgreSQL — no para backend, frontend, ni un
`Dockerfile` de la app. No exponer el backend públicamente ni hacer port forwarding; todo
corre en `localhost` (o red local/VPN si se accede desde el celular). Secretos solo en `.env`
(nunca en código, commits, logs ni respuestas de API).

## Gestor de paquetes

**pnpm, siempre.** Es un workspace de pnpm (`pnpm-workspace.yaml` + `pnpm-lock.yaml`). Correr
`npm install` en la raíz rompe la instalación (npm no entiende la estructura de pnpm y falla
con errores de resolución confusos). Si eso llega a pasar: `rm -rf node_modules && pnpm install`
suele bastar, porque no genera `package-lock.json` en la raíz antes de fallar.

## Estado actual de implementación

Completado:
- Monorepo scaffolded (`apps/web`, `apps/backend`, `packages/shared`, `prisma/`).
- PostgreSQL en Docker, migración inicial aplicada (`prisma/migrations/`).
- Backend NestJS mínimo con `PrismaService` y `GET /health` (verifica DB).
- `packages/shared` con los tipos de análisis y de fuente.

Pendiente (según las etapas del enfoque original):
- CRUD de fuentes y entidades en el backend.
- Layout, sidebar y páginas reales del dashboard en `apps/web` (fuentes, entidades,
  publicaciones, alertas).
- Primer conector de scraping (empezar por una web sencilla; RSS antes que redes sociales;
  Facebook/Instagram al final y solo si hay un mecanismo de acceso permitido).
- Pipeline de IA: detección de entidad, clasificación, resumen, validación con Zod.
- Reglas de alerta configurables en el backend.
- Integración SendPulse/WhatsApp y, opcionalmente, email.
- PWA (manifest, instalación, push opcional) y ejecución periódica configurable
  (`SCRAPING_INTERVAL_MINUTES`).

## Comandos de desarrollo

```bash
pnpm install
pnpm docker:db:up        # levanta solo Postgres
pnpm db:migrate
pnpm dev:backend          # NestJS, http://localhost:3000
pnpm dev:web              # Vite, http://localhost:5173
```
