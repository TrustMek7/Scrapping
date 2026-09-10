import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
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

const REQUIRED_POST_LIMIT = 10;
// Overhead fijo de arrancar/cerrar Chromium para UNA fuente (referencia para
// dimensionar el margen del lote entero en checkAllActiveSources).
const PER_SOURCE_TIMEOUT_MS = 90 * 1000;
const MIN_BATCH_TIMEOUT_MS = 11 * 60 * 1000;

export function describeMissingText(post: Pick<FacebookPost, "kind" | "images">): string {
  switch (post.kind) {
    case "LIVE": return "Transmisión en vivo sin texto extraíble; no hay transcripción configurada.";
    case "VIDEO": return "Video sin texto extraíble; no hay transcripción configurada.";
    case "REEL": return "Reel sin texto extraíble; no hay transcripción configurada.";
    default: return post.images.length
      ? "Imagen sin texto extraíble; no hay OCR configurado."
      : "No se pudo extraer texto ni imágenes; la publicación podría estar vacía o no haberse cargado completamente.";
  }
}

export interface CheckSourcePostOutcome {
  url: string;
  kind: FacebookPost["kind"];
  textLength: number;
  textTruncated: boolean;
  ok: boolean;
  error?: string;
  deduplicated?: boolean;
  relevant?: boolean | null;
  category?: string | null;
  alertCreated?: boolean;
}

export interface CheckAllSourcesResultItem {
  warnings?: string[];
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
  private activeCheck: { cancellationRequested: boolean; startedAt: string; sourceName: string | null; sourceIndex: number; totalSources: number; reviewRunId?: number; warnings: string[] } | null = null;
  private lastCheckStartedAt: string | null = null;

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

  getCheckStatus() {
    return {
      running: this.activeCheck !== null,
      cancellationRequested: this.activeCheck?.cancellationRequested ?? false,
      startedAt: this.activeCheck?.startedAt ?? this.lastCheckStartedAt,
      sourceName: this.activeCheck?.sourceName ?? null,
      sourceIndex: this.activeCheck?.sourceIndex ?? 0,
      totalSources: this.activeCheck?.totalSources ?? 0,
      reviewRunId: this.activeCheck?.reviewRunId ?? null,
      warnings: this.activeCheck?.warnings ?? [],
    };
  }

  cancelActiveCheck() {
    if (!this.activeCheck) return { running: false, cancellationRequested: false };
    this.activeCheck.cancellationRequested = true;
    this.logger.warn("[FACEBOOK] se solicitó detener la revisión activa");
    return this.getCheckStatus();
  }

  private beginCheck() {
    if (this.activeCheck) {
      throw new ConflictException("Ya hay una revisión de Facebook en ejecución.");
    }
    const check = { cancellationRequested: false, startedAt: new Date().toISOString(), sourceName: null as string | null, sourceIndex: 0, totalSources: 0, reviewRunId: undefined as number | undefined, warnings: [] as string[] };
    this.lastCheckStartedAt = check.startedAt;
    this.activeCheck = check;
    return check;
  }

  private finishCheck(check: { cancellationRequested: boolean }) {
    if (this.activeCheck === check) this.activeCheck = null;
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
    headless = true,
  ): Promise<CheckSourcePostOutcome[]> {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      throw new NotFoundException("Fuente no encontrada");
    }
    if (source.type !== "FACEBOOK") {
      throw new BadRequestException("Esta acción solo está disponible para fuentes de tipo FACEBOOK");
    }

    const check = this.beginCheck();
    check.sourceName = source.name;
    check.sourceIndex = 1;
    check.totalSources = 1;
    try {
      check.reviewRunId = (await this.prisma.reviewRun.create({ data: {} })).id;
      return await this.checkSource(
        source,
        (pageUrl, onPost, knownPostUrls, shouldCancel) =>
          getLatestPagePosts(pageUrl, REQUIRED_POST_LIMIT, headless, onPost, knownPostUrls, shouldCancel),
        () => check.cancellationRequested,
      );
    } finally {
      this.finishCheck(check);
    }
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
      knownPostUrls: ReadonlySet<string>,
      shouldCancel: () => boolean,
    ) => Promise<void>,
    shouldCancel: () => boolean,
  ): Promise<CheckSourcePostOutcome[]> {
    const outcomes: CheckSourcePostOutcome[] = [];
    let newCount = 0;
    const sourceStartedAt = Date.now();

    try {
      const pageUrl = normalizeFacebookPageUrl(source.url);
      // Permite cortar el scroll apenas aparece el primer permalink ya
      // procesado. Antes se descubrían siempre los `limit` posts y recién al
      // extraerlos se detectaba el duplicado, pagando decenas de segundos sin
      // trabajo útil en cada revisión normal.
      const knownPublications = await this.prisma.publication.findMany({
        where: { sourceId: source.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { url: true, canonicalUrl: true },
      });
      const knownPostUrls = new Set(
        knownPublications.flatMap(({ url, canonicalUrl }) =>
          canonicalUrl ? [url, canonicalUrl] : [url],
        ),
      );

      await walkPosts(pageUrl, async (post) => {
        if (shouldCancel()) return { stop: true };
        if (!post.text || post.text.trim().length === 0) {
          const noTextReason = describeMissingText(post);
          this.activeCheck?.warnings.push(`${source.name}: ${noTextReason}`);
          const result = await this.analysisService.persistWithoutText({
            reviewRunId: this.activeCheck?.reviewRunId,
            noTextReason,
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
            kind: post.kind,
            textLength: 0,
            textTruncated: false,
            ok: false,
            error: noTextReason,
            deduplicated: result.deduplicated,
          });
          return { stop: false };
        }

        // Análisis (IA/filtro previo) + persistencia + alerta + correo, todo
        // acá adentro — cada publicación se procesa de punta a punta antes de
        // pasar a la siguiente (ver runAndPersist/maybeCreateAlert en AnalysisService).
        const analysisStartedAt = Date.now();
        const result = await this.analysisService.runAndPersist({
          reviewRunId: this.activeCheck?.reviewRunId,
          sourceId: source.id,
          title: `Publicación de ${post.author.name ?? source.name}`,
          content: post.text,
          url: post.url,
          images: post.images,
        });
        this.logger.log(
          `[FACEBOOK][tiempo] persistir + analizar publicación: ${Date.now() - analysisStartedAt} ms`,
        );

        outcomes.push({
          url: post.url,
          kind: post.kind,
          textLength: post.text.length,
          textTruncated: /(?:…|\.\.\.)\s*(?:Ver más|See more)$/i.test(post.text.trim()),
          ok: true,
          deduplicated: result.deduplicated,
          relevant: result.analysis?.relevant ?? null,
          category: result.analysis?.category ?? null,
          alertCreated: !!result.alert,
        });

        if (!result.deduplicated) newCount += 1;
        return { stop: false };
      }, knownPostUrls, shouldCancel);

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

      this.logger.log(
        `[FACEBOOK][tiempo] fuente "${source.name}" ${shouldCancel() ? "detenida" : "completada"}: ${Date.now() - sourceStartedAt} ms`,
      );

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
  async checkAllActiveSources(): Promise<CheckAllSourcesResultItem[]> {
    const sources = await this.prisma.source.findMany({
      where: { type: "FACEBOOK", status: "ACTIVE" },
    });

    if (sources.length === 0) return [];

    if (!(await hasStoredSession())) {
      const error = "Necesitas iniciar sesión en Facebook.";
      return sources.map((source) => ({ sourceId: source.id, sourceName: source.name, ok: false, error }));
    }

    const check = this.beginCheck();
    check.totalSources = sources.length;
    try {
      check.reviewRunId = (await this.prisma.reviewRun.create({ data: {} })).id;
      const results: CheckAllSourcesResultItem[] = [];
      const batchTimeoutMs = Math.max(MIN_BATCH_TIMEOUT_MS, sources.length * PER_SOURCE_TIMEOUT_MS);

      await withFacebookContext<void>(
        true,
        async (context) => {
          for (const source of sources) {
            if (check.cancellationRequested) break;
            check.sourceName = source.name;
            check.sourceIndex += 1;
            try {
              const outcomes = await this.checkSource(
                source,
                (pageUrl, onPost, knownPostUrls, shouldCancel) =>
                  getLatestPagePostsInContext(
                    context,
                    pageUrl,
                    REQUIRED_POST_LIMIT,
                    onPost,
                    knownPostUrls,
                    shouldCancel,
                  ),
                () => check.cancellationRequested,
              );
              results.push({
                sourceId: source.id,
                sourceName: source.name,
                ok: true,
                newPublications: outcomes.filter((o) => o.ok && !o.deduplicated).length,
                newAlerts: outcomes.filter((o) => o.alertCreated).length,
                warnings: outcomes.flatMap((o) => o.error ? [o.error] : []),
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
    } finally {
      this.finishCheck(check);
    }
  }
}
