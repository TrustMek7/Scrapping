import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

export interface AlertEmailInput {
  entityName: string;
  category: string;
  severity: string;
  confidence: number;
  summary: string;
  sourceName: string;
  publicationTitle: string;
  publicationUrl: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private warnedMissingConfig = false;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): nodemailer.Transporter | null {
    const user = this.config.get<string>("GMAIL_USER");
    const appPassword = this.config.get<string>("GMAIL_APP_PASSWORD");
    const to = this.config.get<string>("EMAIL_TO");

    if (!user || !appPassword || !to) {
      if (!this.warnedMissingConfig) {
        this.logger.warn(
          "[MAIL] GMAIL_USER, GMAIL_APP_PASSWORD o EMAIL_TO no configurados — no se enviarán correos de alerta.",
        );
        this.warnedMissingConfig = true;
      }
      return null;
    }

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass: appPassword },
      });
    }

    return this.transporter;
  }

  /** Un fallo al enviar el correo nunca debe tumbar el flujo de creación de la alerta. */
  async sendAlertEmail(input: AlertEmailInput): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) return;

    const user = this.config.get<string>("GMAIL_USER");
    const from = this.config.get<string>("EMAIL_FROM") || user;
    const to = this.config.get<string>("EMAIL_TO");

    try {
      await transporter.sendMail({
        from: `Alertas Nación <${from}>`,
        to,
        subject: `🚨 Alerta ${input.severity} — ${input.entityName} (${input.category})`,
        text: [
          `Entidad: ${input.entityName}`,
          `Categoría: ${input.category}`,
          `Severidad: ${input.severity}`,
          `Confianza: ${Math.round(input.confidence * 100)}%`,
          `Fuente: ${input.sourceName}`,
          "",
          `Resumen: ${input.summary}`,
          "",
          `Publicación: ${input.publicationTitle}`,
          `Enlace: ${input.publicationUrl}`,
        ].join("\n"),
      });
      this.logger.log(`[MAIL] correo de alerta enviado a ${to}`);
    } catch (error) {
      this.logger.error(`[MAIL] no se pudo enviar el correo de alerta: ${(error as Error).message}`);
    }
  }
}
