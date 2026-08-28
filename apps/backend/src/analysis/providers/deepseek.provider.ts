import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { AnalysisResultSchema, type AnalysisResult } from "@scrapping/shared";
import { AIProvider, AnalysisInput } from "../ai-provider.interface";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from "../prompts/analyze.prompt";

/**
 * DeepSeek expone una API compatible con el SDK de OpenAI
 * (https://api-docs.deepseek.com). No hay validación de esquema del lado del
 * proveedor (a diferencia de otros proveedores): pedimos JSON mode y
 * validamos la respuesta nosotros mismos con Zod antes de confiar en ella.
 */
@Injectable()
export class DeepSeekProvider implements AIProvider {
  private readonly logger = new Logger(DeepSeekProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.get<string>("DEEPSEEK_API_KEY"),
      baseURL: "https://api.deepseek.com",
    });
    this.model = this.config.get<string>("DEEPSEEK_MODEL") ?? "deepseek-v4-flash";
  }

  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: buildAnalysisUserPrompt(input) },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("DeepSeek devolvió una respuesta vacía.");
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch {
      this.logger.error(`Respuesta no es JSON válido: ${raw.slice(0, 500)}`);
      throw new Error("La salida de la IA no es JSON válido.");
    }

    const parsed = AnalysisResultSchema.safeParse(candidate);
    if (!parsed.success) {
      this.logger.error(`La salida no cumple el esquema esperado: ${parsed.error.message}`);
      throw new Error("La salida de la IA no cumplió el esquema esperado.");
    }

    return parsed.data;
  }
}
