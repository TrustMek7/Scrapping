import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisService } from "../analysis/analysis.service";
import { checkSession, resetSession, startLogin } from "./lib/session";
import { getLatestPagePosts } from "./lib/navigation";
import { normalizeFacebookPageUrl } from "./lib/validators";
import { getFacebookImage } from "./lib/image-cache";

const DEFAULT_POST_LIMIT = 10;

export interface CheckSourcePostOutcome {
  url: string;
  ok: boolean;
  error?: string;
  deduplicated?: boolean;
  relevant?: boolean | null;
  category?: string | null;
  alertCreated?: boolean;
}

export interface CheckAllSourcesResultItem {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  error?: string;
  newPublications?: number;
  newAlerts?: number;
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
   * Revisa hasta `limit` publicaciones recientes de una Source de tipo
   * FACEBOOK ya registrada, de la más nueva a la más vieja, mandando cada una
   * con texto al pipeline de análisis (dedup + IA + alerta). Se detiene apenas
   * encuentra una publicación que el pipeline reconoce como duplicada (mismo
   * contentHash) — eso significa que ya se procesó en una revisión anterior,
   * así que todo lo que sigue debajo en el timeline también es viejo. En una
   * fuente nueva sin historial, esto hace un backfill de hasta `limit` posts.
   */
  async checkLatestFromSource(sourceId: string, limit = DEFAULT_POST_LIMIT): Promise<CheckSourcePostOutcome[]> {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      throw new NotFoundException("Fuente no encontrada");
    }
    if (source.type !== "FACEBOOK") {
      throw new BadRequestException("Esta acción solo está disponible para fuentes de tipo FACEBOOK");
    }

    const outcomes: CheckSourcePostOutcome[] = [];

    try {
      const pageUrl = normalizeFacebookPageUrl(source.url);
      const posts = await getLatestPagePosts(pageUrl, limit);

      let newCount = 0;

      for (const post of posts) {
        if (!post.text || post.text.trim().length === 0) {
          outcomes.push({
            url: post.url,
            ok: false,
            error: "Esta publicación no tiene texto (parece ser solo imagen/video). Todavía no hay OCR configurado.",
          });
          continue;
        }

        const result = await this.analysisService.runAndPersist({
          sourceId: source.id,
          title: `Publicación de ${post.author.name ?? source.name}`,
          content: post.text,
          url: post.url,
          images: post.images,
        });

        outcomes.push({
          url: post.url,
          ok: true,
          deduplicated: result.deduplicated,
          relevant: result.analysis?.relevant ?? null,
          category: result.analysis?.category ?? null,
          alertCreated: !!result.alert,
        });

        // Ya llegamos a contenido que se procesó en una revisión anterior —
        // todo lo que sigue en el timeline es más viejo todavía. Frenamos acá
        // para no gastar más navegación/tiempo en posts que ya conocemos.
        if (result.deduplicated) break;

        newCount += 1;
      }

      await this.prisma.source.update({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastError: null,
          ...(newCount > 0
            ? { lastPublicationAt: new Date(), publicationsCount: { increment: newCount } }
            : {}),
        },
      });

      return outcomes;
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
  async checkAllActiveSources(limit = DEFAULT_POST_LIMIT): Promise<CheckAllSourcesResultItem[]> {
    const sources = await this.prisma.source.findMany({
      where: { type: "FACEBOOK", status: "ACTIVE" },
    });

    const results: CheckAllSourcesResultItem[] = [];

    for (const source of sources) {
      try {
        const outcomes = await this.checkLatestFromSource(source.id, limit);
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          ok: true,
          newPublications: outcomes.filter((o) => o.ok && !o.deduplicated).length,
          newAlerts: outcomes.filter((o) => o.alertCreated).length,
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
