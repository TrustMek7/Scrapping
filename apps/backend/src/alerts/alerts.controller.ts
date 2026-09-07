import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("alerts")
export class AlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("export")
  async exportAll() {
    return this.prisma.alert.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        summary: true,
        publication: { select: { url: true, source: { select: { name: true } } } },
      },
    });
  }

  @Get()
  async findAll() {
    return this.prisma.alert.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        publication: {
          select: { id: true, title: true, url: true, publishedAt: true, source: { select: { name: true } } },
        },
        entity: { select: { id: true, name: true } },
        notifications: {
          select: { id: true, channel: true, status: true, sentAt: true },
        },
      },
    });
  }
}
