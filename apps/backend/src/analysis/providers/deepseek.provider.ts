import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { AnalysisResultSchema, type AnalysisResult } from "@scrapping/shared";
import { AIProvider, AnalysisInput } from "../ai-provider.interface";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from "../prompts/analyze.prompt";

const MAX_OUTPUT_ATTEMPTS = 3;

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
    const originalPrompt = buildAnalysisUserPrompt(input);
    let correction = "";
    let lastError = "DeepSeek no produjo una respuesta utilizable.";

    for (let attempt = 1; attempt <= MAX_OUTPUT_ATTEMPTS; attempt += 1) {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          {
            role: "user",
            content: correction
              ? `${originalPrompt}\n\nCORRECCIÓN OBLIGATORIA DEL INTENTO ANTERIOR\n${correction}\nDevuelve nuevamente el objeto JSON completo y corregido.`
              : originalPrompt,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) {
        lastError = "DeepSeek devolvió una respuesta vacía.";
        correction =
          "La respuesta anterior llegó vacía. Responde con un único objeto JSON completo que cumpla exactamente el esquema solicitado.";
        this.logRetry(attempt, lastError);
        continue;
      }

      let candidate: unknown;
      try {
        candidate = JSON.parse(raw);
      } catch {
        lastError = "La salida de la IA no es JSON válido.";
        correction =
          "La respuesta anterior no era JSON válido. No uses markdown ni texto adicional; responde únicamente con el objeto JSON solicitado.";
        this.logger.warn(
          `[ANALYSIS] intento ${attempt}/${MAX_OUTPUT_ATTEMPTS}: JSON inválido (${raw.slice(0, 300)})`,
        );
        continue;
      }

      const parsed = AnalysisResultSchema.safeParse(candidate);
      if (!parsed.success) {
        lastError = "La salida de la IA no cumplió el esquema esperado.";
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "raíz"}: ${issue.message}`)
          .join("; ");
        correction = `La respuesta anterior incumplió el esquema: ${issues}. Usa exclusivamente los valores permitidos indicados en el esquema.`;
        this.logger.warn(
          `[ANALYSIS] intento ${attempt}/${MAX_OUTPUT_ATTEMPTS}: salida inválida: ${issues}`,
        );
        continue;
      }

      if (attempt > 1) {
        this.logger.log(
          `[ANALYSIS] respuesta válida obtenida en el intento ${attempt}/${MAX_OUTPUT_ATTEMPTS}.`,
        );
      }
      return parsed.data;
    }

    throw new Error(`${lastError} Se agotaron ${MAX_OUTPUT_ATTEMPTS} intentos.`);
  }

  private logRetry(attempt: number, reason: string) {
    this.logger.warn(`[ANALYSIS] intento ${attempt}/${MAX_OUTPUT_ATTEMPTS}: ${reason}`);
  }
}
