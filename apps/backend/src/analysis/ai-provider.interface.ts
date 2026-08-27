import { AnalysisResult } from "@scrapping/shared";

export interface MonitoredEntityInput {
  name: string;
  aliases: string[];
}

export interface AnalysisInput {
  title: string;
  content: string;
  sourceName: string;
  publishedAt?: Date | null;
  monitoredEntities: MonitoredEntityInput[];
}

/**
 * Abstracción del proveedor de IA (ver skill de contexto: "el proveedor de IA
 * debe quedar abstraído para poder cambiar de modelo sin tocar el resto").
 */
export interface AIProvider {
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}

export const AI_PROVIDER = Symbol("AI_PROVIDER");
