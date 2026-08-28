import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisService } from "../analysis/analysis.service";
import { checkSession, resetSession, startLogin } from "./lib/session";
import { getLatestPagePost } from "./lib/navigation";
import { normalizeFacebookPageUrl } from "./lib/validators";
import { getFacebookImage } from "./lib/image-cache";

export interface CheckAllSourcesResultItem {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  error?: string;
  deduplicated?: boolean;
  alertCreated?: boolean;
}

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisService: AnalysisService,
  ) {}

  checkSessionStatus() {
    return checkSession();
  }

  login() {
    return startLogin();
  }

  logout() {
    return resetSession();
  }

  getImage(id: string) {
    return getFacebookImage(id);
  }

  /**
   * Revisa la última publicación de una Source de tipo FACEBOOK ya registrada,
   * y si tiene texto, la manda directo al pipeline de análisis (dedup + IA + alerta).
   * Actualiza lastRunAt/lastError/lastPublicationAt/publicationsCount de la Source.
   */
  async checkLatestFromSource(sourceId: string) {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      throw new NotFoundException("Fuente no encontrada");
    }
    if (source.type !== "FACEBOOK") {
      throw new BadRequestException("Esta acción solo está disponible para fuentes de tipo FACEBOOK");
    }

    try {
      const pageUrl = normalizeFacebookPageUrl(source.url);
      const post = await getLatestPagePost(pageUrl);

      if (!post.text || post.text.trim().length === 0) {
        throw new BadRequestException(
          "La última publicación de esta página no tiene texto (parece ser solo imagen). Todavía no hay OCR configurado, así que no se puede analizar automáticamente.",
        );
      }

      const result = await this.analysisService.runAndPersist({
        sourceId: source.id,
        title: `Publicación de ${post.author.name ?? source.name}`,
        content: post.text,
        url: post.url,
        images: post.images,
      });

      await this.prisma.source.update({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastError: null,
          ...(result.deduplicated
            ? {}
            : { lastPublicationAt: new Date(), publicationsCount: { increment: 1 } }),
        },
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al revisar la fuente.";
      this.logger.error(`[FACEBOOK] falló la revisión de "${source.name}": ${message}`);

      // Si esta actualización también falla (ej. columna muy chica) no queremos
      // perder el error original — que es el que realmente le interesa al usuario.
      await this.prisma.source
        .update({ where: { id: source.id }, data: { lastRunAt: new Date(), lastError: message } })
        .catch((updateError) =>
          this.logger.error(`[FACEBOOK] no se pudo guardar lastError: ${(updateError as Error).message}`),
        );

      throw error;
    }
  }

  /**
   * Revisa todas las Source de tipo FACEBOOK activas, una por una (secuencial,
   * misma sesión de navegador). El fallo de una fuente no detiene a las demás
   * — cada resultado (éxito o error) se acumula y se devuelve al final.
   */
  async checkAllActiveSources(): Promise<CheckAllSourcesResultItem[]> {
    const sources = await this.prisma.source.findMany({
      where: { type: "FACEBOOK", status: "ACTIVE" },
    });

    const results: CheckAllSourcesResultItem[] = [];

    for (const source of sources) {
      try {
        const result = await this.checkLatestFromSource(source.id);
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          ok: true,
          deduplicated: result.deduplicated,
          alertCreated: !!result.alert,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido.";
        this.logger.warn(`[FACEBOOK] falló la revisión de "${source.name}": ${message}`);
        results.push({ sourceId: source.id, sourceName: source.name, ok: false, error: message });
      }
    }

    return results;
  }
}
