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

Dominio: las entidades monitoreadas son actores políticos (partidos, candidatos) y lo que se
detecta son ataques/menciones de índole política. Esto hace más crítica todavía la regla de
"la IA no es fuente de verdad" — un error de clasificación acá no es un detalle técnico, es
convertir una acusación política en un hecho afirmado sobre una persona real.

## Reglas de colaboración con el agente

- **Antes de proponer o implementar una integración con un servicio externo** (proveedor de
  IA, mensajería, email, etc.), **preguntar primero de dónde debe venir** (qué proveedor,
  con qué credenciales) — no asumir un proveedor por defecto (p.ej. no asumir Anthropic/Claude
  solo por ser el ecosistema del propio Claude Code). El usuario puede ya tener una API key de
  otro proveedor (ej. DeepSeek) que prefiera usar.

## Arquitectura implementada

Monorepo con pnpm workspaces:

```text
Scrapping/
├── apps/
│   ├── web/            React + Vite + TypeScript + Tailwind (PWA) — pnpm
│   ├── backend/        NestJS + TypeScript + Prisma — pnpm
│   └── postscope/      Next.js + Playwright — npm, FUERA del workspace de pnpm
├── packages/
│   └── shared/         Tipos compartidos (analysis.ts, source.ts, entity.ts)
├── prisma/
│   └── schema.prisma   Modelos + migraciones
├── docker-compose.yml  Un único servicio: postgres
├── .env / .env.example
└── pnpm-workspace.yaml
```

**`apps/postscope` es un caso especial**: es un proyecto Next.js+Playwright que llegó ya armado
(no lo construí yo originalmente) para extraer manualmente una publicación de Facebook por URL
— login 100% manual del usuario en una ventana real de Chromium, sesión persistida en
`.facebook-session/` (gitignored), sin evadir CAPTCHA/2FA/anti-bot. Usa **npm**, no pnpm, y
`pnpm-workspace.yaml` lo excluye explícitamente (`!apps/postscope`) para que no choque con el
resto del workspace. Se corre por separado: `cd apps/postscope && npm run dev`. Ver
"Historial: el incidente del refactor" más abajo para el contexto de cómo llegó a esta carpeta.

- **apps/web** es la plantilla TailAdmin React reubicada tal cual (antes vivía en la raíz del
  repo). El paquete se llama `web` (no `tailadmin-react`) para que los filtros de pnpm
  (`pnpm --filter web ...`) funcionen.
- **apps/backend** expone por ahora un único endpoint `GET /health` que además verifica la
  conexión a Postgres vía `PrismaService` (`apps/backend/src/prisma/`). `PrismaModule` es
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

**PostgreSQL** (de nuevo — ver "Historial: ida y vuelta MySQL↔Postgres" más abajo para el porqué
del segundo cambio). En local corre **solo en Docker** (`docker-compose.yml`, servicio
`postgres`, imagen `postgres:16`, volumen persistente `postgres_data`, usuario/base `scrapping`).
El resto del stack (backend, frontend, scraper, IA) corre nativo con pnpm — no hay Dockerfile
para la app. En producción/despliegue, la base vive en **Supabase** (Postgres gestionado, plan
gratuito) — ver `DATABASE_URL` en el `.env` de ese entorno.

**Puerto 5433 en el host, no el 5432 default de Postgres.** Esta máquina de desarrollo tiene una
instalación **nativa de PostgreSQL en Windows** (proceso `postgres.exe` corriendo como servicio)
que ya ocupa el 5432 — las conexiones a `localhost:5432` caían silenciosamente en esa instancia
nativa (con credenciales completamente distintas) en vez del contenedor Docker, dando errores de
autenticación que parecían de credenciales mal escritas y en realidad eran de puerto compartido.
Si migras a otra máquina, comprobá el 5433 igual (`netstat`/`Get-NetTCPConnection` en Windows)
antes de asumir que está libre.

**`MonitoredEntity.aliases` es `String[]` nativo** (array de Postgres) — ya no hace falta el
workaround de `Json`/casteo manual que exigía MySQL (ver historial abajo). Si en algún lado del
código todavía aparece un cast `as string[]` sobre `aliases`, es rezago del período MySQL y se
puede simplificar.

Comandos: `pnpm docker:db:up`, `pnpm docker:db:down`, `pnpm db:migrate`, `pnpm db:generate`,
`pnpm db:studio`. Para aplicar migraciones ya existentes en una base nueva (ej. Supabase recién
creado) usar `pnpm exec prisma migrate deploy`, no `pnpm db:migrate` (que corre `migrate dev`,
pensado para desarrollo activo y que pide una shadow database).

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

No introducir sin necesidad real y explícita: Firebase, SQLite, MongoDB, Vercel, AWS/GCP/Azure,
Kubernetes, Nx, Turborepo, microservicios, Redis, BullMQ. **Supabase ya no está en esta lista**:
se adoptó explícitamente (2026-08-31) como hosting gratuito de Postgres para el despliegue — ver
"Base de datos" arriba. Docker se usa por ahora **únicamente** para el contenedor de la base de
datos (Postgres en local) — backend, frontend y PostScope corren nativos. Esto va a cambiar cuando se haga la dockerización completa del stack
pendiente (ver "Historial: el incidente del refactor" más abajo), pero no adelantar eso sin que
el usuario lo pida explícitamente. No exponer el backend públicamente ni hacer port forwarding;
todo corre en `localhost` (o red local/VPN si se accede desde el celular). Secretos solo en
`.env` (nunca en código, commits, logs ni respuestas de API).

## Gestor de paquetes

**pnpm, siempre — excepto `apps/postscope`.** Es un workspace de pnpm (`pnpm-workspace.yaml` +
`pnpm-lock.yaml`). Correr `npm install` en la raíz rompe la instalación (npm no entiende la
estructura de pnpm y falla con errores de resolución confusos). Si eso llega a pasar:
`rm -rf node_modules && pnpm install` suele bastar, porque no genera `package-lock.json` en la
raíz antes de fallar. `apps/postscope` es la única excepción: usa npm con su propio
`package-lock.json`, excluido del workspace de pnpm a propósito — instalar ahí es
`cd apps/postscope && npm install`, nunca desde la raíz.

## Estado actual de implementación

Completado:
- Monorepo scaffolded (`apps/web`, `apps/backend`, `packages/shared`, `prisma/`).
- PostgreSQL en Docker (local) + Supabase (despliegue), migración inicial aplicada (`prisma/migrations/`).
- Backend NestJS mínimo con `PrismaService` y `GET /health` (verifica DB).
- `packages/shared` con los tipos de análisis y de fuente (esquemas Zod, no solo tipos TS).
- Pipeline de IA (`apps/backend/src/analysis/`): `AIProvider` abstraído + `DeepSeekProvider`
  (proveedor activo — ver más abajo), prompt versionado, validación con Zod, persistencia de
  `Analysis` y creación de `Alert` según reglas configurables (`ALERT_CATEGORIES`,
  `ALERT_MIN_CONFIDENCE`). Probable vía `POST /analysis/preview` (sin persistir) y
  `POST /analysis/run` (flujo completo, requiere un `Source` existente).

**Proveedor de IA activo: DeepSeek**, no Anthropic/Claude. Modelo `deepseek-v4-flash`
(configurable vía `DEEPSEEK_MODEL`), API compatible con OpenAI (`baseURL:
https://api.deepseek.com`, paquete `openai` npm, no `@anthropic-ai/sdk`). A diferencia de
otros proveedores, DeepSeek no valida el esquema de salida del lado del servidor: se pide
`response_format: {type: "json_object"}` y el esquema se describe dentro del propio prompt
(`analysis/prompts/analyze.prompt.ts`); la validación real ocurre después, en el backend, con
`AnalysisResultSchema.safeParse()`. Si se cambia de proveedor en el futuro, implementar una
nueva clase que cumpla `AIProvider` (`analysis/ai-provider.interface.ts`) y cambiar el binding
en `analysis.module.ts` — no tocar `AnalysisService` ni el prompt.

- CRUD de fuentes (`apps/backend/src/sources/`, `GET/POST/PATCH/DELETE /sources`) y de
  entidades monitoreadas (`apps/backend/src/entities/`, mismos verbos en `/entities`),
  validado con los esquemas Zod de `@scrapping/shared` (`source.ts`, `entity.ts`).
- Conector de Facebook (`apps/backend/src/facebook/`): sesión de Playwright con login manual,
  extracción de la última publicación de una `Source` tipo `FACEBOOK` y envío directo al
  pipeline de análisis. Botón de acción en `/monitoreo/alertas`. Ver la sección dedicada más
  abajo — es la pieza más frágil/reciente del proyecto, no probada contra Facebook real.
- Frontend real (ya no la plantilla TailAdmin sin tocar): se limpiaron todas las páginas/rutas
  demo del template (Calendar, User Profile, Forms, Tables, Charts, UI Elements, Auth, Blank,
  el dashboard Ecommerce falso, el dropdown de usuario/notificaciones falso, el widget de
  "Purchase Plan") — solo quedan las rutas reales bajo "Monitoreo": `/monitoreo/alertas`,
  `/monitoreo/fuentes`, `/monitoreo/entidades` (listado + modal de alta/edición para las dos
  últimas). `/` redirige a `/monitoreo/alertas`; cualquier ruta no reconocida cae en el 404
  real (`pages/OtherPage/NotFound.tsx`, ya existía, solo se conectó bien). Marca del proyecto:
  "Alertas" (sidebar, header móvil, `<title>`) — reemplaza el branding TailAdmin.
  Se conservó la librería de componentes reutilizables de TailAdmin (`components/ui`,
  `components/form` sin las demos de `form-elements`, `components/common`) porque Etapa 4
  todavía la necesita.

Pendiente (según las etapas del enfoque original):
- Página de Publicaciones en el frontend (el modelo y los datos ya existen vía `Analysis`,
  falta la vista).
- Conectores de scraping — ver sección "Conector de Facebook/Instagram" más abajo para el plan
  acordado. Website/RSS siguen sin construir pero no tienen ninguna restricción, se pueden
  automatizar por completo cuando se retomen.
- Integración SendPulse/WhatsApp y, opcionalmente, email (las `Alert` ya se crean y son
  visibles en el dashboard — decisión explícita del usuario de que la notificación sea local
  por ahora, no por WhatsApp/email; el modelo `Notification` existe en el schema pero no se
  usa todavía).
- PWA (manifest, instalación, push opcional) y ejecución periódica configurable para
  Website/RSS (variable de entorno tipo `SCRAPING_INTERVAL_MINUTES` — se quitó de `.env` por
  no estar en uso; volver a agregarla recién cuando se construya ese scraper. Ver más abajo por
  qué Facebook/Instagram NO debe correr con un intervalo automático, ni fijo ni aleatorio).

## Conector de Facebook — implementado directo en el backend (no en PostScope) (2026-08-28)

**Cambio de arquitectura importante**: la lógica de Playwright/sesión/extracción se probó
primero en `apps/postscope` (un proyecto Next.js que llegó ya armado, ver el incidente del
refactor más abajo), pero el usuario pidió explícitamente que PostScope fuera solo **un
ejemplo de referencia** — el mecanismo real tenía que vivir **dentro del backend principal**,
con el botón de acción **en el dashboard de Alertas** (`apps/web`), no en una app
Next.js aparte corriendo en otro puerto. Eso es lo que existe ahora:

- `apps/backend/src/facebook/lib/` — puerto casi literal de `apps/postscope/src/lib/facebook/`
  (browser.ts, session.ts, validators.ts, navigation.ts, extractor.ts, image-cache.ts, errors.ts,
  types.ts). Misma lógica, mismos límites de seguridad (login 100% manual, sin evadir CAPTCHA/
  2FA, allowlist estricta de host, sin stealth/proxies). Al portar tuve que corregir dos cosas
  que en Next.js no eran un problema: (1) `import path from "node:path"` rompía en runtime
  porque el `tsconfig` del backend no tiene `esModuleInterop` — hay que usar
  `import * as path from "node:path"`; (2) un carácter non-breaking space que se me coló como
  byte literal en vez de escape en `extractor.ts` — evitado con `String.fromCharCode(160)`.
- `apps/backend/src/facebook/facebook.service.ts` — `checkLatestFromSource(sourceId)` busca la
  `Source` en la BD, valida que sea `type: "FACEBOOK"`, navega a su `url` y extrae la
  publicación más reciente — y si tiene texto, **la manda directo a
  `AnalysisService.runAndPersist()`** (dedup + DeepSeek + reglas de alerta), todo en una sola
  llamada. No hace falta un paso intermedio de "enviar a análisis" como en la versión PostScope,
  porque ahora está todo en el mismo proceso con acceso directo a Prisma.
- `apps/backend/src/facebook/facebook.controller.ts` — `GET/POST/DELETE /facebook/session`
  (chequeo de sesión, login manual que abre una ventana real de Chromium **en la máquina donde
  corre el backend**, logout), `POST /facebook/sources/:id/check` (dispara todo el flujo),
  `GET /facebook/images/:id` (sirve las imágenes cacheadas en memoria).
- **La sesión de Facebook del backend vive en `apps/backend/.facebook-session/`** — es una
  sesión NUEVA, separada de la que tenía `apps/postscope/.facebook-session/` (no se comparte
  entre los dos procesos). Hay que loguearse de nuevo la primera vez que se usa desde acá.
- Frontend: el panel "Revisar Facebook" está **en `/monitoreo/alertas`**
  (`apps/web/src/pages/Monitoring/Alerts.tsx`), justo arriba de la tabla de alertas — no en
  Fuentes, no en una app aparte. Muestra el estado de la sesión, botón de login/logout, un
  `<select>` con las Fuentes `FACEBOOK` activas (`GET /sources` filtrado en el cliente), y el
  botón "Revisar última publicación" que llama a `POST /facebook/sources/:id/check` y recarga
  la lista de alertas al terminar.
- `apps/postscope` **se dejó tal cual, sin borrar** (no se tocó su código) — quedó como
  prototipo/referencia. Preguntarle al usuario antes de eliminarlo o seguir invirtiendo ahí.

**Esto es más frágil que la extracción de un post puntual.** El timeline de una página
(`[role="feed"]` → primer `[role="article"]`) es mucho menos predecible que el diálogo de un
permalink: carga diferida, contenido patrocinado mezclado, estructura que cambia más seguido.
No se probó contra Facebook real (sin acceso). Si falla en uso real, el primer lugar para mirar
es `extractLatestFeedPost` en `apps/backend/src/facebook/lib/extractor.ts`.

**Limitación conocida**: si la última publicación no tiene texto (típico de imagen sin
caption), `checkLatestFromSource` tira un 400 explicando que hace falta OCR — no se analiza
nada automáticamente en ese caso.

Reglas duras ya negociadas con el usuario — no reabrir la discusión sin una razón nueva:

- **Disparo manual únicamente.** El botón "Revisar última publicación" lo aprieta el usuario
  cuando quiere. **NUNCA** un scheduler/cron, ni con intervalo fijo ni con intervalo aleatorio.
  El usuario propuso explícitamente un intervalo aleatorio "para que Facebook no detecte nada"
  y se rechazó: randomizar el timing no derrota los sistemas anti-bot de Meta (que miran
  patrones de sesión, no solo horarios) y sigue siendo automatización no supervisada, que es
  exactamente lo que el proyecto prohíbe (ver sección de Redes sociales más abajo). Si en algún
  momento se propone de nuevo algo con "intervalo" para Facebook/Instagram específicamente,
  es una señal de alerta — recordar esta regla antes de implementar.
- La deduplicación por `contentHash` (ya existe en `AnalysisService.runAndPersist`) es lo que
  hace útil revisar una página más de una vez: sin eso, cada revisión re-analizaría lo mismo.
- **"Descubrir el último post" ya está resuelto** (navegación directa a la URL de la página, sin
  buscador externo). Una API de búsqueda (Google Custom Search / Bing / SerpAPI) solo haría
  falta si en el futuro se quiere descubrir **varios** posts nuevos a la vez en vez de solo el
  más reciente — no asumir que hace falta, preguntar primero si eso se retoma.
- **OCR sigue pendiente de decisión del usuario**: los ataques políticos suelen venir como
  imagen con texto (memes, tarjetas), no texto plano. Tesseract local vs. API de visión —
  todavía no elegido.
- **Meta Content Library** (sucesor oficial de CrowdTangle, mid-2024) sigue siendo la vía
  sancionada por Meta para leer contenido público de páginas que el usuario no administra, con
  cobertura mucho más amplia que "solo el último post de una página a la vez" — pero requiere
  afiliación académica/sin fines de lucro y un trámite de aprobación (no es código). El email
  del usuario es `@unsa.edu.pe`, podría calificar.

## Historial: el incidente del "Refactor" (2026-08-27)

Fuera de esta conversación/sesión, se hicieron 4 commits directos a `main` (ya pusheados a
`origin/main`) que: (1) agregaron PostScope completo en la raíz del repo, y (2) un commit
llamado "Refactor" que **borró todo el código fuente de `apps/backend`, `apps/web`,
`packages/shared`, `prisma/`, `pnpm-workspace.yaml`, `docker-compose.yml` y `.agents/`**, y de
paso committeó `node_modules/` y `dist/` completos (~11,954 archivos, ~3.79M líneas insertadas)
— eso quedó permanentemente en el historial de git salvo que en algún momento se reescriba
(operación delicada, ya con push hecho).

Se recuperó restaurando esos paths desde el commit `c660907` (el último bueno antes del
refactor) y reubicando los archivos de PostScope a `apps/postscope/`. Nada se perdió porque
nunca se hizo `git gc` agresivo, pero si en el futuro algo del backend/frontend/Prisma
"desaparece" sin que esta sesión lo haya tocado, **este es el tipo de evento a sospechar
primero** — revisar `git log --oneline` antes de asumir que hay un bug nuevo.

Pendiente explícito, dicho por el usuario: **dockerizar todo el stack** (base de datos + backend +
web + PostScope, este último necesita una imagen base con Chromium) para poder exportarlo como
imagen — se acordó dejarlo para el final, después de terminar el conector de Facebook y el
resto de las features funcionales. No adelantar esa reorganización sin que el usuario lo pida.

### Historial: ida y vuelta MySQL↔Postgres

- **2026-08-28**: se migró de PostgreSQL (elección original del skill de construcción) a MySQL.
  El usuario dijo "Postgres es muy pesado para este proyecto", lo cual técnicamente no era
  cierto (ambos motores tienen huella de recursos prácticamente idéntica para un proyecto de
  este tamaño), pero era su decisión y no había razón funcional para insistir en lo contrario.
- **2026-08-31**: se migró de vuelta a PostgreSQL. Motivo esta vez es concreto y técnico, no de
  preferencia: para desplegar gratis, el hosting elegido (**Supabase**) es Postgres-only — no
  ofrece MySQL en ningún plan. Se revirtió el workaround de `aliases: Json` a `String[]` nativo
  y se restauró `onDelete: Cascade` en `Alert.publication` (la restricción de "múltiples caminos
  en cascada" que forzó a quitarlo era específica de MySQL; Postgres no la tiene). Las
  migraciones se resetearon desde cero (el SQL de las migraciones de MySQL no es compatible con
  Postgres). Si en el futuro alguien pregunta "¿por qué no estamos en MySQL?": esta es la razón,
  y no tiene sentido volver a menos que cambie el proveedor de hosting de la base de datos.

## Comandos de desarrollo

```bash
pnpm install
pnpm docker:db:up        # levanta solo Postgres
pnpm db:migrate
pnpm dev:backend          # NestJS, http://localhost:3200
pnpm dev:web              # Vite, http://localhost:5173
```
