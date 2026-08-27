# Skill: Implementación del sistema local de monitoreo

## Objetivo

Implementar una aplicación local de monitoreo de publicaciones públicas en fuentes configuradas por el usuario.

El sistema debe:

1. Registrar fuentes públicas.
2. Registrar entidades que se desean monitorear.
3. Consultar periódicamente las fuentes.
4. Detectar publicaciones nuevas.
5. Determinar si una publicación está relacionada con alguna entidad monitoreada.
6. Analizar el contenido mediante IA.
7. Clasificar el contenido.
8. Generar un resumen neutral.
9. Determinar si corresponde generar una alerta.
10. Guardar la información en PostgreSQL.
11. Enviar una alerta a un único número mediante SendPulse/WhatsApp.
12. Mostrar publicaciones, análisis y alertas en una PWA local.

La aplicación debe ejecutarse inicialmente en **una única computadora**, sin depender de infraestructura cloud.

---

# 1. Arquitectura

El proyecto debe ser un único monorepo:

```text
Scrapping/
├── apps/
│   ├── web/
│   └── backend/
│
├── packages/
│   └── shared/
│
├── prisma/
│   └── schema.prisma
│
├── .env
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## `apps/web`

Frontend:

* React
* Vite
* TypeScript
* Tailwind CSS
* shadcn/ui
* PWA

Responsabilidad:

* Dashboard
* Alertas
* Publicaciones
* Fuentes
* Entidades
* Configuración
* Estado del sistema

## `apps/backend`

Backend:

* Node.js
* TypeScript
* NestJS
* Prisma

Responsabilidad:

* API
* scraping
* procesamiento
* análisis
* clasificación
* resumen
* alertas
* notificaciones
* tareas periódicas

## Base de datos

Usar:

* PostgreSQL local
* Prisma ORM

PostgreSQL ya está instalado en la computadora del usuario.

---

# 2. Restricciones tecnológicas

NO introducir estas tecnologías salvo solicitud explícita:

* Supabase
* Firebase
* SQLite
* MongoDB
* Vercel
* AWS
* Google Cloud
* Azure
* Docker
* Kubernetes
* Nx
* Turborepo
* microservicios
* Redis
* BullMQ

El sistema debe funcionar localmente.

No crear infraestructura cloud innecesaria.

No introducir colas o workers separados hasta que exista una necesidad real.

---

# 3. Principio de simplicidad

La arquitectura inicial debe ser:

```text
PC LOCAL
│
├── React PWA
├── NestJS Backend
├── Scraper
├── Análisis IA
└── PostgreSQL
```

El scraper, análisis y notificaciones pueden ejecutarse dentro del backend.

No crear un servicio independiente para cada función.

Prioridad:

```text
Simple
↓
Funcional
↓
Mantenible
↓
Escalable cuando sea necesario
```

---

# 4. Flujo general

```text
Fuentes configuradas
        ↓
Scraper
        ↓
Detectar publicaciones nuevas
        ↓
Guardar publicación
        ↓
Detectar entidades mencionadas
        ↓
Análisis IA
        ↓
Clasificación + resumen
        ↓
Reglas de alerta
        ↓
¿Generar alerta?
       / \
     NO   SÍ
     │     │
     │     ▼
     │   Crear alerta
     │     │
     │     ├──→ SendPulse → WhatsApp
     │     │
     │     └──→ Email opcional
     │
     ▼
Historial
```

La publicación original siempre debe conservarse junto con su URL.

---

# 5. Fuentes

El sistema debe permitir registrar fuentes manualmente.

Una fuente puede representar:

* página web
* RSS
* Facebook
* Instagram
* otras fuentes públicas compatibles

Crear una capa de conectores:

```text
SourceConnector
├── WebsiteConnector
├── RSSConnector
├── FacebookConnector
└── InstagramConnector
```

Cada conector debe encapsular su propio método de obtención.

No asumir que todas las plataformas funcionan mediante scraping HTML.

---

# 6. Redes sociales

Especialmente para Facebook e Instagram:

Antes de implementar un conector:

1. determinar qué acceso está disponible;
2. verificar si existe API oficial o mecanismo permitido;
3. comprobar qué datos pueden obtenerse;
4. implementar el conector según ese mecanismo.

NO implementar técnicas para evadir:

* CAPTCHA
* autenticación
* rate limits
* bloqueos
* mecanismos anti-bot
* controles de acceso

Si una fuente no puede ser consultada automáticamente, registrar el error y mostrarlo en el dashboard.

No permitir que el fallo de una fuente detenga todo el sistema.

---

# 7. Entidades monitoreadas

El usuario debe poder crear entidades:

```text
Partido X
Candidato Y
Candidato Z
```

Una publicación puede mencionar varias entidades.

La detección debe considerar:

* nombre
* variantes
* alias configurados
* contexto

No depender exclusivamente de coincidencias exactas.

La IA puede utilizarse para confirmar la relación contextual.

---

# 8. Pipeline de IA

La IA debe ser un componente independiente del backend.

Arquitectura:

```text
Publication
     ↓
Preprocessing
     ↓
Entity Detection
     ↓
Classification
     ↓
Summarization
     ↓
Structured Result
     ↓
Validation
     ↓
Alert Rules
```

La IA **no debe enviar directamente notificaciones**.

El backend recibe el resultado, lo valida y posteriormente decide si genera una alerta.

---

# 9. La IA no es fuente de verdad

Regla fundamental:

> La IA interpreta el contenido; la publicación original es la fuente.

Nunca convertir automáticamente una acusación en un hecho.

Ejemplo incorrecto:

```text
Fuente:
"Medio X afirma que el candidato cometió corrupción."

Resumen:
"El candidato cometió corrupción."
```

Ejemplo correcto:

```text
Resumen:
"El medio X informa sobre una acusación de corrupción
contra el candidato."
```

Diferenciar:

* hecho reportado
* opinión
* crítica
* acusación
* denuncia
* alegación
* información confirmada por la fuente
* contenido no verificable

El sistema NO debe determinar por sí mismo que una acusación es verdadera.

---

# 10. Clasificación

La IA debe clasificar el contenido en categorías controladas:

```text
POSITIVE
NEUTRAL
CRITICISM
COMPLAINT
ALLEGATION
DENUNCIA
SCANDAL
OTHER_RELEVANT
IRRELEVANT
```

También debe proporcionar una severidad:

```text
LOW
MEDIUM
HIGH
```

Y una confianza:

```text
0.0 - 1.0
```

La confianza representa la confianza del modelo en su clasificación, no la veracidad de la información.

---

# 11. Salida estructurada de IA

La IA debe devolver exclusivamente una estructura validable.

Ejemplo:

```json
{
  "relevant": true,
  "entities": [
    {
      "name": "Partido X",
      "confidence": 0.94
    }
  ],
  "category": "DENUNCIA",
  "severity": "HIGH",
  "confidence": 0.91,
  "summary": "La publicación informa sobre una denuncia presentada contra un candidato del Partido X.",
  "reason": "El contenido reporta directamente una denuncia relacionada con una entidad monitoreada.",
  "claims": [
    {
      "text": "Se presentó una denuncia contra el candidato.",
      "type": "REPORTED_CLAIM"
    }
  ]
}
```

La salida debe validarse mediante un esquema.

Preferir:

* Zod
* validación equivalente compatible con TypeScript

No confiar ciegamente en el JSON producido por el modelo.

Si la salida no cumple el esquema:

1. registrar el error;
2. intentar una corrección controlada si corresponde;
3. si continúa fallando, marcar el análisis como fallido;
4. no generar una alerta automática con información inválida.

---

# 12. Tipos de afirmaciones

Las afirmaciones extraídas por IA pueden utilizar tipos como:

```text
FACT
REPORTED_CLAIM
OPINION
ALLEGATION
DENIAL
UNVERIFIED
```

Ejemplo:

```json
{
  "text": "El candidato fue denunciado.",
  "type": "REPORTED_CLAIM"
}
```

No interpretar automáticamente:

```text
REPORTED_CLAIM
```

como:

```text
FACT
```

---

# 13. Prompt de análisis

Los prompts deben estar versionados dentro del proyecto.

Estructura recomendada:

```text
apps/backend/
└── src/
    └── analysis/
        ├── prompts/
        │   ├── classify.prompt.ts
        │   └── summarize.prompt.ts
        │
        ├── schemas/
        │   └── analysis.schema.ts
        │
        ├── analysis.service.ts
        └── analysis.types.ts
```

El prompt base debe indicar claramente:

```text
Analiza únicamente el contenido proporcionado.

Determina si la publicación es relevante para alguna
de las entidades monitoreadas.

Clasifica el contenido utilizando exclusivamente las
categorías disponibles.

Genera un resumen neutral y fiel al contenido original.

No inventes información.

No presentes acusaciones o afirmaciones de terceros
como hechos comprobados.

Distingue entre hechos reportados, opiniones,
acusaciones, denuncias y afirmaciones no verificadas.

No determines la veracidad de una acusación.

Devuelve exclusivamente el formato estructurado
solicitado.
```

El prompt debe recibir:

```text
PUBLICACIÓN
ENTIDADES MONITOREADAS
CATEGORÍAS DISPONIBLES
REGLAS DE CLASIFICACIÓN
```

---

# 14. No hardcodear el comportamiento de la IA

Evitar lógica como:

```text
if text.includes("corrupción")
    category = DENUNCIA
```

Las palabras clave pueden utilizarse como señales auxiliares, pero no como clasificación principal.

El contexto es obligatorio.

Ejemplo:

```text
"El candidato presentó una propuesta contra la corrupción."
```

No debe clasificarse como una denuncia simplemente por contener la palabra "corrupción".

---

# 15. Reglas de alerta

La IA propone:

```text
relevant
category
severity
confidence
```

Pero el backend decide si enviar la alerta.

Ejemplo conceptual:

```text
SI relevant = true
Y category ∈ [DENUNCIA, ALLEGATION, SCANDAL]
Y confidence >= umbral
ENTONCES generar alerta
```

Los umbrales deben ser configurables.

No enviar automáticamente todo lo que la IA marque como negativo.

---

# 16. Resumen

El resumen debe:

* ser breve;
* ser neutral;
* representar fielmente el contenido;
* no inventar información;
* preservar contexto;
* identificar acusaciones como acusaciones;
* mencionar quién realiza una afirmación cuando sea importante.

Siempre conservar:

```text
Título original
Contenido original
URL original
Fuente
Fecha
```

El resumen nunca reemplaza la publicación original.

---

# 17. Alertas

Una alerta debe contener como mínimo:

```text
id
publicationId
entityId
category
severity
confidence
summary
createdAt
```

La publicación relacionada debe conservar:

```text
source
title
content
publishedAt
url
externalId
```

Ejemplo:

```text
🔴 NUEVA ALERTA

Entidad:
Partido X

Tipo:
Denuncia

Severidad:
Alta

Fuente:
Medio X

Resumen:
La publicación informa sobre una denuncia
presentada contra...

Ver publicación:
https://...
```

---

# 18. WhatsApp mediante SendPulse

WhatsApp será un canal de notificación.

SendPulse funcionará como integración externa.

El sistema inicialmente enviará alertas a **un único número configurado**.

No implementar mensajería masiva.

Credenciales mediante `.env`.

Ejemplo:

```env
SENDPULSE_API_KEY=
SENDPULSE_API_SECRET=
WHATSAPP_TARGET_NUMBER=
```

No almacenar secretos en Git.

El servicio debe estar abstraído:

```text
NotificationService
└── WhatsAppNotificationService
```

El backend decide cuándo llamar al servicio.

La IA nunca debe llamar directamente a SendPulse.

---

# 19. Email

El email es opcional.

Debe utilizar una cuenta remitente configurada por el usuario.

Configuración mediante `.env`.

Ejemplo:

```env
EMAIL_FROM=
EMAIL_TO=
```

Implementar como otro canal:

```text
NotificationService
├── WhatsAppNotificationService
└── EmailNotificationService
```

---

# 20. PWA

La web debe ser instalable como PWA.

Debe prepararse para:

* instalación
* funcionamiento responsive
* notificaciones push
* acceso desde dispositivos dentro de la red local

Las notificaciones push son opcionales inicialmente porque WhatsApp será el canal principal.

---

# 21. Dashboard

La interfaz debe utilizar:

* React
* Vite
* TypeScript
* Tailwind
* shadcn/ui

Navegación:

```text
Dashboard
Alertas
Publicaciones
Fuentes
Entidades
Configuración
```

Dashboard:

```text
Publicaciones analizadas
Alertas
Fuentes activas
Entidades monitoreadas
Distribución por categoría
Últimas alertas
Estado de fuentes
Estado del scraper
```

No crear páginas innecesarias.

---

# 22. Base de datos

Usar PostgreSQL + Prisma.

Modelo conceptual:

```text
Source
MonitoredEntity
Publication
PublicationEntity
Analysis
Alert
Notification
```

Relaciones:

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

El modelo exacto puede ajustarse durante la implementación.

---

# 23. Deduplificación

No guardar dos veces la misma publicación.

Priorizar identificadores:

1. ID externo de la plataforma.
2. URL canónica.
3. Hash u otro identificador estable.

Una publicación duplicada no debe generar una nueva alerta.

---

# 24. Ejecución periódica

El backend debe ejecutar el scraping periódicamente.

Ejemplo:

```text
cada 5 minutos
     ↓
obtener fuentes activas
     ↓
consultar publicaciones
     ↓
detectar nuevas
     ↓
procesar
```

El intervalo debe ser configurable.

Ejemplo:

```env
SCRAPING_INTERVAL_MINUTES=5
```

No hacer scraping innecesariamente agresivo.

---

# 25. Estado de las fuentes

Cada fuente debe tener:

```text
ACTIVE
ERROR
DISABLED
```

Registrar:

* última ejecución
* última publicación encontrada
* último error
* cantidad de publicaciones obtenidas

Una fuente con error no debe detener las demás.

---

# 26. Seguridad

La aplicación está diseñada para ejecutarse localmente.

Por defecto:

```text
localhost
```

No exponer el backend públicamente.

No configurar port forwarding.

No publicar API keys.

Usar `.env`.

Crear `.env.example`.

No incluir secretos en:

* código
* commits
* logs
* respuestas de API
* frontend

Si se permite acceso desde el celular, preferir una red local o VPN privada.

---

# 27. Logs

Registrar eventos relevantes:

```text
[SCRAPER] fuente iniciada
[SCRAPER] publicaciones encontradas
[SCRAPER] publicación nueva
[ANALYSIS] análisis iniciado
[ANALYSIS] clasificación completada
[ALERT] alerta creada
[NOTIFICATION] WhatsApp enviado
[ERROR] fuente no disponible
```

No registrar credenciales ni tokens.

---

# 28. Desarrollo por etapas

No implementar todo de una sola vez.

## Etapa 1

Monorepo:

```text
apps/web
apps/backend
packages/shared
```

Configurar:

* pnpm
* TypeScript
* React
* Vite
* NestJS

## Etapa 2

PostgreSQL + Prisma.

Crear modelos iniciales.

## Etapa 3

Backend:

* health check
* CRUD de fuentes
* CRUD de entidades

## Etapa 4

Frontend:

* layout
* sidebar
* dashboard
* fuentes
* entidades
* publicaciones
* alertas

## Etapa 5

Primer scraper.

Comenzar por una página web sencilla.

NO comenzar por Facebook.

Flujo:

```text
Fuente
↓
Scraper
↓
Nueva publicación
↓
PostgreSQL
↓
Dashboard
```

## Etapa 6

Pipeline de IA:

```text
Publicación
↓
Detección de entidad
↓
Clasificación
↓
Resumen
↓
Validación Zod
↓
PostgreSQL
```

## Etapa 7

Reglas de alerta.

## Etapa 8

SendPulse/WhatsApp.

## Etapa 9

Email opcional.

## Etapa 10

PWA y push.

## Etapa 11

Conectores adicionales.

---

# 29. Regla especial para la implementación con IA

Antes de implementar el servicio de IA:

1. definir el esquema de salida;
2. definir las categorías;
3. definir los tipos de afirmación;
4. definir el prompt;
5. implementar validación;
6. implementar almacenamiento del resultado;
7. después implementar las reglas de alerta.

No comenzar llamando directamente a un modelo desde un controlador HTTP.

La estructura debe ser:

```text
Controller
   ↓
AnalysisService
   ↓
AIProvider
   ↓
StructuredOutput
   ↓
Schema Validation
   ↓
Analysis
```

El proveedor de IA debe estar abstraído para permitir cambiar de modelo posteriormente.

---

# 30. Regla para Claude Code

Antes de modificar una parte importante:

1. inspeccionar la estructura existente;
2. revisar dependencias;
3. reutilizar código existente;
4. no reemplazar archivos completos innecesariamente;
5. hacer cambios pequeños;
6. ejecutar build/tests;
7. corregir errores antes de continuar;
8. explicar brevemente qué fue modificado.

No introducir tecnologías nuevas sin necesidad.

No realizar una refactorización masiva si no es necesaria para la funcionalidad solicitada.

---

# 31. Objetivo final

El resultado debe poder ejecutarse completamente en una computadora:

```text
                 💻 PC LOCAL

              PostgreSQL
                   ▲
                   │
              NestJS Backend
                   │
       ┌───────────┼───────────┐
       │           │           │
    Scraper      IA        Alertas
       │           │           │
       └───────────┼───────────┘
                   │
              React PWA
                   │
                   ▼
               Dashboard

Backend
   │
   ├──→ SendPulse → WhatsApp
   │
   └──→ Email
```

No depender inicialmente de:

* Supabase
* Vercel
* Firebase
* Docker
* VPS
* servicios cloud para ejecutar la aplicación

La única comunicación externa necesaria será la realizada por el sistema hacia las fuentes y servicios externos configurados.

---

# 32. Principio final

El sistema debe considerarse un **monitor de información pública**, no un sistema que determine la verdad de las acusaciones.

Debe:

```text
Detectar
↓
Contextualizar
↓
Clasificar
↓
Resumir
↓
Alertar
↓
Permitir revisar la fuente original
```

Siempre priorizar:

**fuente original + contexto + trazabilidad + revisión humana**

sobre afirmaciones automáticas de veracidad.
