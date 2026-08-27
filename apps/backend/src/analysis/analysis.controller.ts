import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
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
}
