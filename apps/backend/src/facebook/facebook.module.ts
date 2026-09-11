import { Module } from "@nestjs/common";
import { FacebookController } from "./facebook.controller";
import { FacebookService } from "./facebook.service";
import { FacebookAutoCheckService } from "./facebook-auto-check.service";
import { AnalysisModule } from "../analysis/analysis.module";
import { SystemController } from "./system.controller";

@Module({
  imports: [AnalysisModule],
  controllers: [FacebookController, SystemController],
  providers: [FacebookService, FacebookAutoCheckService],
})
export class FacebookModule {}
