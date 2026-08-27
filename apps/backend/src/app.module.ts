import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { AnalysisModule } from "./analysis/analysis.module";
import { AlertsModule } from "./alerts/alerts.module";
import { SourcesModule } from "./sources/sources.module";
import { EntitiesModule } from "./entities/entities.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
    }),
    PrismaModule,
    AnalysisModule,
    AlertsModule,
    SourcesModule,
    EntitiesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
