import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { MailService } from "../notifications/mail.service";
import { PrismaService } from "../prisma/prisma.service";

const testEmailSchema = z.object({
  entityName: z.string().min(1),
  category: z.string().min(1),
  severity: z.string().min(1),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  sourceName: z.string().min(1),
  publicationTitle: z.string().min(1),
  publicationUrl: z.string().url(),
  recipientEmail: z.string().email().optional(),
});

@Controller("alerts")
export class AlertsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async findAll() {
    return this.prisma.alert.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
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

  /** Estado de la configuración actual de mail para probar en entorno local. */
  @Get("test/config")
  async getMailTestConfig() {
    const user = this.config.get<string>("GMAIL_USER");
    const appPassword = this.config.get<string>("GMAIL_APP_PASSWORD");
    const to = this.config.get<string>("EMAIL_TO");

    return {
      configured: this.mailService.isConfigured(),
      hasGmailUser: !!user,
      hasAppPassword: !!appPassword,
      hasRecipient: !!to,
      recipient: to ?? null,
      mode: this.mailService.isConfigured() ? "LIVE" : "DRY_RUN",
    };
  }

  /** Envío de correo puntual para pruebas sin tocar la lógica de alertas real. */
  @Post("test/email")
  async sendTestEmail(@Body() body: unknown) {
    const parsed = testEmailSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const recipient = parsed.data.recipientEmail ?? this.config.get<string>("EMAIL_TO");
    if (!recipient) {
      throw new BadRequestException("Falta EMAIL_TO o recipientEmail para enviar el correo de prueba.");
    }

    await this.mailService.sendAlertEmail({
      entityName: parsed.data.entityName,
      category: parsed.data.category,
      severity: parsed.data.severity,
      confidence: parsed.data.confidence,
      summary: parsed.data.summary,
      sourceName: parsed.data.sourceName,
      publicationTitle: parsed.data.publicationTitle,
      publicationUrl: parsed.data.publicationUrl,
      recipientEmail: recipient,
    });

    return {
      ok: true,
      mode: "TEST_ONLY",
      sentTo: recipient,
      simulatedAlert: {
        entityName: parsed.data.entityName,
        category: parsed.data.category,
        severity: parsed.data.severity,
        confidence: parsed.data.confidence,
        summary: parsed.data.summary,
        sourceName: parsed.data.sourceName,
        publicationTitle: parsed.data.publicationTitle,
        publicationUrl: parsed.data.publicationUrl,
      },
    };
  }

  /** Simula una revisión manual de una publicación y dispara el correo en modo de prueba. */
  @Post("test/manual-alert")
  async sendManualAlertTest(@Body() body: unknown) {
    const parsed = testEmailSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const recipient = parsed.data.recipientEmail ?? this.config.get<string>("EMAIL_TO");
    if (!recipient) {
      throw new BadRequestException("Falta EMAIL_TO o recipientEmail para disparar la prueba de alerta.");
    }

    await this.mailService.sendAlertEmail({
      entityName: parsed.data.entityName,
      category: parsed.data.category,
      severity: parsed.data.severity,
      confidence: parsed.data.confidence,
      summary: parsed.data.summary,
      sourceName: parsed.data.sourceName,
      publicationTitle: parsed.data.publicationTitle,
      publicationUrl: parsed.data.publicationUrl,
      recipientEmail: recipient,
    });

    return {
      ok: true,
      mode: "MANUAL_ALERT_TEST",
      sentTo: recipient,
      preview: {
        entityName: parsed.data.entityName,
        category: parsed.data.category,
        severity: parsed.data.severity,
        confidence: parsed.data.confidence,
        summary: parsed.data.summary,
        sourceName: parsed.data.sourceName,
        publicationTitle: parsed.data.publicationTitle,
        publicationUrl: parsed.data.publicationUrl,
      },
    };
  }
}
