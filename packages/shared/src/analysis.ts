import { z } from "zod";

export const ContentCategorySchema = z.enum([
  "POSITIVE",
  "NEUTRAL",
  "CRITICISM",
  "COMPLAINT",
  "ALLEGATION",
  "DENUNCIA",
  "SCANDAL",
  "OTHER_RELEVANT",
  "IRRELEVANT",
]);
export type ContentCategory = z.infer<typeof ContentCategorySchema>;

export const SeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const ClaimTypeSchema = z.enum([
  "FACT",
  "REPORTED_CLAIM",
  "OPINION",
  "ALLEGATION",
  "DENIAL",
  "UNVERIFIED",
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const AnalysisClaimSchema = z.object({
  text: z.string(),
  type: ClaimTypeSchema,
});
export type AnalysisClaim = z.infer<typeof AnalysisClaimSchema>;

export const AnalysisEntityMatchSchema = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1),
});
export type AnalysisEntityMatch = z.infer<typeof AnalysisEntityMatchSchema>;

/** Salida estructurada que debe producir el pipeline de IA (ver skill de contexto, sección "Reglas de negocio invariables"). */
export const AnalysisResultSchema = z.object({
  relevant: z.boolean(),
  entities: z.array(AnalysisEntityMatchSchema),
  category: ContentCategorySchema,
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  reason: z.string(),
  claims: z.array(AnalysisClaimSchema),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
