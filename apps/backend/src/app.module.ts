import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { AppController } from "./app.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { AnalysisModule } from "./analysis/analysis.module";
import { AlertsModule } from "./alerts/alerts.module";
import { SourcesModule } from "./sources/sources.module";
import { EntitiesModule } from "./entities/entities.module";
import { FacebookModule } from "./facebook/facebook.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AnalysisModule,
    AlertsModule,
    SourcesModule,
    EntitiesModule,
    FacebookModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
