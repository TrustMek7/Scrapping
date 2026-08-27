import { Module } from "@nestjs/common";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { AI_PROVIDER } from "./ai-provider.interface";
import { DeepSeekProvider } from "./providers/deepseek.provider";

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, DeepSeekProvider, { provide: AI_PROVIDER, useExisting: DeepSeekProvider }],
  exports: [AnalysisService],
})
export class AnalysisModule {}
