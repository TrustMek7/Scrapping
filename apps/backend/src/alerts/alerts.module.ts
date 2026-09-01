import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { AlertsController } from "./alerts.controller";

@Module({
  imports: [NotificationsModule],
  controllers: [AlertsController],
})
export class AlertsModule {}
