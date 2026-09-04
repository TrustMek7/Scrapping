import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Source } from "@prisma/client";
import type { FacebookPost } from "./lib/types";
import type { OnPostResult } from "./lib/navigation";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisService } from "../analysis/analysis.service";
import { checkSession, hasStoredSession, resetSession, startLogin } from "./lib/session";
import { getLatestPagePosts, getLatestPagePostsInContext } from "./lib/navigation";
import { withFacebookContext } from "./lib/browser";
import { normalizeFacebookPageUrl } from "./lib/validators";
import { getFacebookImage } from "./lib/image-cache";

const DEFAULT_POST_LIMIT = 10;
// Overhead fijo de arrancar/cerrar Chromium para UNA fuente (referencia para
// dimensionar el margen del lote entero en checkAllActiveSources).
const PER_SOURCE_TIMEOUT_MS = 90 * 1000;
const MIN_BATCH_TIMEOUT_MS = 11 * 60 * 1000;

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
  async checkLatestFromSource(
    sourceId: string,
    limit = DEFAULT_POST_LIMIT,
    headless = true,
  ): Promise<CheckSourcePostOutcome[]> {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      throw new NotFoundException("Fuente no encontrada");
    }
    if (source.type !== "FACEBOOK") {
      throw new BadRequestException("Esta acción solo está disponible para fuentes de tipo FACEBOOK");
    }

    return this.checkSource(source, (pageUrl, onPost) => getLatestPagePosts(pageUrl, limit, headless, onPost));
  }

  /**
   * Núcleo compartido por `checkLatestFromSource` (una fuente puntual, con
   * su propio navegador) y `checkAllActiveSources` (todas las fuentes en un
   * único navegador reusado) — lo único que cambia entre ambas es CÓMO se
   * recorren los posts (`walkPosts`), no qué se hace con cada uno.
   *
   * `walkPosts` entrega cada post apenas se extrae (no espera a tener los
   * `limit` completos) — así, si Facebook se cae a mitad de una fuente, lo
   * que ya se analizó/insertó/alertó antes del fallo queda guardado, en vez
   * de perderse por no haber llegado a "juntar todo" antes de persistir.
   */
  private async checkSource(
    source: Source,
    walkPosts: (
      pageUrl: string,
      onPost: (post: FacebookPost, index: number) => Promise<OnPostResult>,
    ) => Promise<void>,
  ): Promise<CheckSourcePostOutcome[]> {
    const outcomes: CheckSourcePostOutcome[] = [];
    let newCount = 0;

    try {
      const pageUrl = normalizeFacebookPageUrl(source.url);

      await walkPosts(pageUrl, async (post) => {
        if (!post.text || post.text.trim().length === 0) {
          const result = await this.analysisService.persistWithoutText({
            sourceId: source.id,
            title: `Publicación de ${post.author.name ?? source.name}`,
            content: "",
            url: post.url,
            images: post.images,
          });
          this.logger.log(
            `[FACEBOOK] publicación persistida sin texto (deduplicated=${result.deduplicated}, url=${post.url})`,
          );
          if (!result.deduplicated) newCount += 1;
          outcomes.push({
            url: post.url,
            ok: false,
            error: "Esta publicación no tiene texto (parece ser solo imagen/video). Todavía no hay OCR configurado.",
          });
          return { stop: false };
        }

        // Análisis (IA/filtro previo) + persistencia + alerta + correo, todo
        // acá adentro — cada publicación se procesa de punta a punta antes de
        // pasar a la siguiente (ver runAndPersist/maybeCreateAlert en AnalysisService).
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
        if (result.deduplicated) return { stop: true };

        newCount += 1;
        return { stop: false };
      });

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
   * Revisa todas las Source de tipo FACEBOOK activas, una por una, dentro de
   * UN SOLO navegador reusado para todo el lote — arrancar/cerrar Chromium
   * por fuente es puro overhead fijo que no depende del contenido de cada
   * una, así que evitarlo repetir N veces ahorra tiempo real sin tocar la
   * lógica de extracción. El fallo de una fuente no detiene a las demás ni
   * cierra el navegador — cada resultado (éxito o error) se acumula y se
   * devuelve al final.
   */
  async checkAllActiveSources(
    limit = DEFAULT_POST_LIMIT,
  ): Promise<CheckAllSourcesResultItem[]> {
    const sources = await this.prisma.source.findMany({
      where: { type: "FACEBOOK", status: "ACTIVE" },
    });

    if (sources.length === 0) return [];

    if (!(await hasStoredSession())) {
      const error = "Necesitas iniciar sesión en Facebook.";
      return sources.map((source) => ({ sourceId: source.id, sourceName: source.name, ok: false, error }));
    }

    const results: CheckAllSourcesResultItem[] = [];
    const batchTimeoutMs = Math.max(MIN_BATCH_TIMEOUT_MS, sources.length * PER_SOURCE_TIMEOUT_MS);

    await withFacebookContext<void>(
      true,
      async (context) => {
        for (const source of sources) {
          try {
            const outcomes = await this.checkSource(source, (pageUrl, onPost) =>
              getLatestPagePostsInContext(context, pageUrl, limit, onPost),
            );
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
      },
      batchTimeoutMs,
    );

    return results;
  }
}
