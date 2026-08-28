import { Module } from "@nestjs/common";
import { FacebookController } from "./facebook.controller";
import { FacebookService } from "./facebook.service";
import { AnalysisModule } from "../analysis/analysis.module";

@Module({
  imports: [AnalysisModule],
  controllers: [FacebookController],
  providers: [FacebookService],
})
export class FacebookModule {}
