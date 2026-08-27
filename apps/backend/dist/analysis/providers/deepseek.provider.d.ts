import { ConfigService } from "@nestjs/config";
import { type AnalysisResult } from "@scrapping/shared";
import { AIProvider, AnalysisInput } from "../ai-provider.interface";
export declare class DeepSeekProvider implements AIProvider {
    private readonly config;
    private readonly logger;
    private readonly client;
    private readonly model;
    constructor(config: ConfigService);
    analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
