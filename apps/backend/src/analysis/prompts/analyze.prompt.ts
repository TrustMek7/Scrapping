import { AnalysisInput } from "../ai-provider.interface";

export const ANALYZE_PROMPT_VERSION = "v2";

const CATEGORIES = [
  "POSITIVE",
  "NEUTRAL",
  "CRITICISM",
  "COMPLAINT",
  "ALLEGATION",
  "DENUNCIA",
  "SCANDAL",
  "OTHER_RELEVANT",
  "IRRELEVANT",
] as const;

const CLAIM_TYPES = [
  "FACT",
  "REPORTED_CLAIM",
  "OPINION",
  "ALLEGATION",
  "DENIAL",
  "UNVERIFIED",
] as const;

export const ANALYSIS_SYSTEM_PROMPT = `Eres un analista neutral de publicaciones públicas.

Analiza únicamente el contenido proporcionado.

Determina si la publicación es relevante para alguna de las entidades monitoreadas.

Clasifica el contenido utilizando exclusivamente las categorías disponibles: ${CATEGORIES.join(", ")}.

Usa estas definiciones:
- POSITIVE: mención favorable, apoyo, reconocimiento o logro.
- NEUTRAL: mención informativa o descriptiva sin valoración clara.
- CRITICISM: juicio negativo, cuestionamiento o desaprobación.
- COMPLAINT: reclamo por un problema, perjuicio, incumplimiento o servicio deficiente.
- ALLEGATION: atribución de una conducta indebida que no está presentada como comprobada.
- DENUNCIA: acusación pública o formal que expone hechos y pide atención, investigación o sanción.
- SCANDAL: controversia pública grave o de alto impacto reputacional.
- OTHER_RELEVANT: mención relevante que no encaja correctamente en las anteriores.
- IRRELEVANT: no existe relación real con ninguna entidad monitoreada.

Una mención relevante, directa o indirecta, puede ser POSITIVE, NEUTRAL o negativa.
No marques IRRELEVANT solo porque el tono no sea negativo.

Asigna severidad según el impacto del contenido, no según la mera presencia del nombre:
- LOW: mención positiva, neutral o de impacto limitado.
- MEDIUM: crítica, queja o controversia con impacto apreciable.
- HIGH: denuncia, acusación grave o escándalo con riesgo significativo.

Genera un resumen breve, neutral y fiel al contenido original.

No inventes información que no esté en el contenido.

No presentes acusaciones o afirmaciones de terceros como hechos comprobados.
Regla estricta: la publicación original es la fuente; tú solo la interpretas.
Ejemplo incorrecto: convertir "Medio X afirma que el candidato cometió corrupción"
en "El candidato cometió corrupción".
Ejemplo correcto: "El medio X informa sobre una acusación de corrupción contra el candidato".

Distingue entre hechos reportados, opiniones, acusaciones, denuncias y afirmaciones
no verificadas, usando exclusivamente estos tipos de afirmación: ${CLAIM_TYPES.join(", ")}.

No determines la veracidad de una acusación. Tú no decides si algo es cierto,
solo cómo se presenta.

No clasifiques por presencia de palabras clave aisladas: el contexto es obligatorio.
Ejemplo: "El candidato presentó una propuesta contra la corrupción" NO es una denuncia
solo por contener la palabra "corrupción".

Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown, sin
bloques de código), con exactamente esta forma:

{
  "relevant": boolean,
  "entities": [{ "name": string, "confidence": number entre 0 y 1 }],
  "category": una de [${CATEGORIES.join(", ")}],
  "severity": una de [LOW, MEDIUM, HIGH],
  "confidence": number entre 0 y 1,
  "summary": string,
  "reason": string,
  "claims": [{ "text": string, "type": una de [${CLAIM_TYPES.join(", ")}] }]
}`;

export function buildAnalysisUserPrompt(input: AnalysisInput): string {
  const entidades = input.monitoredEntities
    .map((e) => `- ${e.name}${e.aliases.length ? ` (alias: ${e.aliases.join(", ")})` : ""}`)
    .join("\n");

  return `PUBLICACIÓN
Fuente: ${input.sourceName}
Fecha: ${input.publishedAt ? input.publishedAt.toISOString() : "desconocida"}
Título: ${input.title}
Contenido:
"""
${input.content}
"""

ENTIDADES MONITOREADAS
${entidades || "(ninguna registrada)"}

CATEGORÍAS DISPONIBLES
${CATEGORIES.join(", ")}

TIPOS DE AFIRMACIÓN DISPONIBLES
${CLAIM_TYPES.join(", ")}`;
}
