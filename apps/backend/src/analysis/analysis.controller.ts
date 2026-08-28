import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { SourceTypeSchema } from "@scrapping/shared";
import { AnalysisService } from "./analysis.service";

const previewSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  sourceName: z.string().min(1),
  publishedAt: z.coerce.date().optional(),
});

const runSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  url: z.string().url(),
  externalId: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
});

const captureSchema = z.object({
  sourceName: z.string().min(1),
  sourceType: SourceTypeSchema,
  sourceUrl: z.string().url().optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  url: z.string().url(),
  externalId: z.string().optional(),
});

@Controller("analysis")
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  /** Prueba el prompt/modelo contra las entidades ya registradas, sin guardar nada. */
  @Post("preview")
  async preview(@Body() body: unknown) {
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.analysisService.preview(parsed.data);
  }

  /** Flujo completo: guarda publicación + análisis y evalúa reglas de alerta. */
  @Post("run")
  async run(@Body() body: unknown) {
    const parsed = runSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.analysisService.runAndPersist(parsed.data);
  }

  /**
   * Para conectores externos (ej. PostScope) que extraen una publicación puntual
   * y no conocen el CRUD de fuentes: busca o crea la Source por nombre+tipo.
   */
  @Post("capture")
  async capture(@Body() body: unknown) {
    const parsed = captureSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.analysisService.captureExternalPost(parsed.data);
  }
}
