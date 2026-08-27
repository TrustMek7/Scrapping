import { AnalysisInput } from "../ai-provider.interface";
export declare const ANALYZE_PROMPT_VERSION = "v1";
export declare const ANALYSIS_SYSTEM_PROMPT: string;
export declare function buildAnalysisUserPrompt(input: AnalysisInput): string;
