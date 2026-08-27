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
export interface AIProvider {
    analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
export declare const AI_PROVIDER: unique symbol;
