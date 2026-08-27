export type ContentCategory =
  | "POSITIVE"
  | "NEUTRAL"
  | "CRITICISM"
  | "COMPLAINT"
  | "ALLEGATION"
  | "DENUNCIA"
  | "SCANDAL"
  | "OTHER_RELEVANT"
  | "IRRELEVANT";

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export type ClaimType =
  | "FACT"
  | "REPORTED_CLAIM"
  | "OPINION"
  | "ALLEGATION"
  | "DENIAL"
  | "UNVERIFIED";

export interface AnalysisClaim {
  text: string;
  type: ClaimType;
}

export interface AnalysisEntityMatch {
  name: string;
  confidence: number;
}

/** Salida estructurada que debe producir el pipeline de IA (ver skill, sección 11). */
export interface AnalysisResult {
  relevant: boolean;
  entities: AnalysisEntityMatch[];
  category: ContentCategory;
  severity: Severity;
  confidence: number;
  summary: string;
  reason: string;
  claims: AnalysisClaim[];
}
