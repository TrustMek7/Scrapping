import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { AnalysisResult, AnalysisResultSchema, SourceType } from "@scrapping/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AI_PROVIDER, AIProvider, AnalysisInput, MonitoredEntityInput } from "./ai-provider.interface";
import { MailService } from "../notifications/mail.service";

export interface PublicationImageInput {
  url: string;
  alt: string | null;
  width: number;
  height: number;
}

export interface RunAnalysisInput {
  reviewRunId?: number;
  noTextReason?: string;
  sourceId: string;
  title: string;
  content: string;
  url: string;
  externalId?: string;
  publishedAt?: Date;
  images?: PublicationImageInput[];
}

export interface CaptureExternalPostInput {
  sourceName: string;
  sourceType: SourceType;
  sourceUrl?: string;
  title: string;
  content: string;
  url: string;
  externalId?: string;
}

/**
 * Normaliza diferencias de presentación que no cambian la publicación:
 * tipografía matemática/negrita, espacios invisibles y el sufijo de UI
 * "Ver más" que a veces queda incluido cuando Facebook trunca un caption.
 */
function normalizeContentForDedup(content: string): string {
  return content
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/(?:…|\.\.\.)?\s*(?:ver más|see more)\s*$/iu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function isDuplicateContent(left: string, right: string): boolean {
  const normalizedLeft = normalizeContentForDedup(left);
  const normalizedRight = normalizeContentForDedup(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const [shorter, longer] =
    normalizedLeft.length <= normalizedRight.length
      ? [normalizedLeft, normalizedRight]
      : [normalizedRight, normalizedLeft];

  // Facebook puede devolver solo el encabezado en un tipo de permalink y el
  // caption completo en otro. Un prefijo de al menos 40 caracteres dentro de
  // la misma fuente es suficientemente específico para tratarlos como uno.
  return shorter.length >= 40 && longer.startsWith(shorter);
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly aiProvider: AIProvider,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  /** Corre el análisis sin persistir nada — útil para probar el prompt/modelo. */
  async preview(input: {
    title: string;
    content: string;
    sourceName: string;
    publishedAt?: Date;
  }): Promise<AnalysisResult> {
    const monitoredEntities = await this.loadMonitoredEntities();
    return this.aiProvider.analyze({ ...input, monitoredEntities });
  }

  /**
   * Flujo completo: guarda la publicación (con deduplicación), la analiza,
   * guarda el análisis y, si corresponde según las reglas de alerta, crea la alerta.
   * La IA nunca decide la alerta: solo propone; esta función decide.
   */
  async runAndPersist(input: RunAnalysisInput) {
    const normalizedContent = normalizeContentForDedup(input.content);
    const contentHash = createHash("sha256")
      .update(normalizedContent || input.content.trim())
      .digest("hex");

    let existing = await this.prisma.publication.findUnique({ where: { contentHash } });
    if (!existing) {
      // Compatibilidad con registros creados antes de usar el hash normalizado
      // y detección de captions truncados/completos con URLs distintas.
      const recentFromSameSource = await this.prisma.publication.findMany({
        where: { sourceId: input.sourceId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      existing =
        recentFromSameSource.find((publication) =>
          isDuplicateContent(publication.content, input.content),
        ) ?? null;
    }
    if (existing) {
      this.logger.log(
        `[SCRAPER] publicación duplicada por texto normalizado/prefijo, se omite (existingId=${existing.id})`,
      );

      // El texto es igual, pero la extracción sí volvió a descargar y cachear la
      // imagen (el cache anterior pudo haber expirado o perderse en un reinicio) —
      // sin esto, la publicación se queda apuntando a un link de imagen muerto
      // para siempre, aunque cada revisión haya guardado una copia fresca.
      const publication = input.images && input.images.length > 0
        ? await this.prisma.publication.update({
            where: { id: existing.id },
            data: { images: input.images as unknown as object },
          })
        : existing;

      const analysis = await this.prisma.analysis.findUnique({ where: { publicationId: existing.id } });
      let alert = analysis
        ? await this.prisma.alert.findUnique({ where: { analysisId: analysis.id } })
        : null;

      // Una ejecución anterior pudo analizar correctamente la publicación pero
      // no crear la alerta porque el nombre devuelto por la IA no resolvía la
      // entidad (por ejemplo, "Ángel" frente a "Angel"). Al reintentar, reutiliza
      // el resultado ya validado y crea únicamente la alerta pendiente, sin
      // volver a consumir DeepSeek y sin duplicar alertas existentes.
      if (!alert && analysis?.status === "COMPLETED") {
        const parsedResult = AnalysisResultSchema.safeParse(analysis.rawOutput);
        if (parsedResult.success) {
          const monitoredEntitiesRaw = await this.prisma.monitoredEntity.findMany();
          const monitoredEntities = monitoredEntitiesRaw.map((entity) => ({
            id: entity.id,
            name: entity.name,
            aliases: entity.aliases,
          }));
          const source = await this.prisma.source.findUniqueOrThrow({ where: { id: existing.sourceId } });

          await this.linkMatchedEntities(existing.id, parsedResult.data.entities, monitoredEntities);
          alert = await this.maybeCreateAlert(
            analysis.id,
            publication,
            source.name,
            parsedResult.data,
            monitoredEntities,
          );
        }
      }

      return { publication, analysis, alert, deduplicated: true };
    }

    const publication = await this.prisma.publication.create({
      data: {
        reviewRunId: input.reviewRunId,
        sourceId: input.sourceId,
        externalId: input.externalId,
        title: input.title,
        content: input.content,
        url: input.url,
        contentHash,
        publishedAt: input.publishedAt,
        images: (input.images ?? []) as unknown as object,
      },
    });

    const monitoredEntitiesRaw = await this.prisma.monitoredEntity.findMany();
    const monitoredEntities = monitoredEntitiesRaw.map((e) => ({
      id: e.id,
      name: e.name,
      aliases: e.aliases,
    }));

    const source = await this.prisma.source.findUniqueOrThrow({ where: { id: input.sourceId } });

    let result: AnalysisResult;

    // Toda publicación nueva con texto pasa por la IA. Un filtro literal por
    // nombre o alias perdería referencias indirectas, cargos y apodos.
    try {
      result = await this.aiProvider.analyze({
        title: input.title,
        content: input.content,
        sourceName: source.name,
        publishedAt: input.publishedAt,
        monitoredEntities: monitoredEntities.map((e) => ({ name: e.name, aliases: e.aliases })),
      });
    } catch (error) {
      this.logger.error(`[ANALYSIS] falló el análisis: ${(error as Error).message}`);
      const analysis = await this.prisma.analysis.create({
        data: {
          publicationId: publication.id,
          status: "FAILED",
          error: (error as Error).message,
        },
      });
      return { publication, analysis, alert: null, deduplicated: false };
    }

    const analysis = await this.prisma.analysis.create({
      data: {
        publicationId: publication.id,
        status: "COMPLETED",
        relevant: result.relevant,
        category: result.category,
        severity: result.severity,
        confidence: result.confidence,
        summary: result.summary,
        reason: result.reason,
        claims: result.claims,
        rawOutput: result as unknown as object,
      },
    });

    await this.linkMatchedEntities(publication.id, result.entities, monitoredEntities);

    const alert = await this.maybeCreateAlert(analysis.id, publication, source.name, result, monitoredEntities);

    return { publication, analysis, alert, deduplicated: false };
  }

  /** Guarda publicaciones multimedia que no tienen texto extraíble sin enviarlas a la IA. */
  async persistWithoutText(input: RunAnalysisInput) {
    const contentHash = createHash("sha256").update(`no-text:${input.url}`).digest("hex");
    const existing = await this.prisma.publication.findUnique({ where: { contentHash } });

    if (existing) {
      return {
        publication: existing,
        analysis: await this.prisma.analysis.findUnique({ where: { publicationId: existing.id } }),
        alert: null,
        deduplicated: true,
      };
    }

    const publication = await this.prisma.publication.create({
      data: {
        reviewRunId: input.reviewRunId,
        sourceId: input.sourceId,
        externalId: input.externalId,
        title: input.title,
        content: input.content,
        url: input.url,
        contentHash,
        publishedAt: input.publishedAt,
        images: (input.images ?? []) as unknown as object,
      },
    });
    const analysis = await this.prisma.analysis.create({
      data: {
        publicationId: publication.id,
        status: "FAILED",
        error: input.noTextReason ?? "No se pudo extraer texto de la publicación.",
      },
    });

    return { publication, analysis, alert: null, deduplicated: false };
  }

  /**
   * Punto de entrada para conectores externos (ej. PostScope) que extraen una
   * publicación puntual y no conocen el CRUD de fuentes: busca la Source por
   * nombre+tipo o la crea si no existe, y delega en runAndPersist.
   */
  async captureExternalPost(input: CaptureExternalPostInput) {
    let source = await this.prisma.source.findFirst({
      where: { name: input.sourceName, type: input.sourceType },
    });

    if (!source) {
      source = await this.prisma.source.create({
        data: {
          name: input.sourceName,
          type: input.sourceType,
          url: input.sourceUrl ?? input.url,
        },
      });
      this.logger.log(`[CAPTURE] fuente nueva creada automáticamente: ${input.sourceName} (${input.sourceType})`);
    }

    return this.runAndPersist({
      sourceId: source.id,
      title: input.title,
      content: input.content,
      url: input.url,
      externalId: input.externalId,
    });
  }

  /** Lista las últimas publicaciones analizadas, tengan o no alerta — registro/historial de revisiones. */
  async listRecent() {
    const publications = await this.prisma.publication.findMany({
      where: { analysis: { is: { relevant: true } } },
      orderBy: { createdAt: "desc" },
      include: { source: { select: { name: true } }, analysis: true, entities: { include: { entity: { select: { name: true, aliases: true } } } } },
    });

    // Publicaciones creadas antes de agregar la columna "images" quedaron con NULL
    // en vez de "[]" — normalizamos acá para que el frontend siempre reciba un array.
    return publications.map((publication) => ({
      ...publication,
      images: (publication.images as PublicationImageInput[] | null) ?? [],
    }));
  }

  /** Borra todo el historial de publicaciones analizadas (y sus análisis/alertas en cascada). */
  async deleteAllPublications() {
    const { count } = await this.prisma.publication.deleteMany();
    return { deleted: count };
  }

  private async loadMonitoredEntities(): Promise<MonitoredEntityInput[]> {
    const entities = await this.prisma.monitoredEntity.findMany();
    return entities.map((e) => ({ name: e.name, aliases: e.aliases }));
  }

  private async linkMatchedEntities(
    publicationId: string,
    matches: AnalysisResult["entities"],
    monitoredEntities: { id: string; name: string; aliases: string[] }[],
  ) {
    for (const match of matches) {
      const entity = this.resolveEntity(match.name, monitoredEntities);
      if (!entity) continue;
      await this.prisma.publicationEntity.upsert({
        where: { publicationId_entityId: { publicationId, entityId: entity.id } },
        create: { publicationId, entityId: entity.id, confidence: match.confidence },
        update: { confidence: match.confidence },
      });
    }
  }

  /**
   * Reglas de alerta (backend decide, no la IA — ver skill de contexto).
   * Umbrales configurables vía ALERT_CATEGORIES / ALERT_MIN_CONFIDENCE.
   */
  private async maybeCreateAlert(
    analysisId: string,
    publication: { id: string; title: string; url: string },
    sourceName: string,
    result: AnalysisResult,
    monitoredEntities: { id: string; name: string; aliases: string[] }[],
  ) {
    if (!result.relevant) return null;

    const alertCategories = (this.config.get<string>("ALERT_CATEGORIES") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const minConfidence = Number(this.config.get<string>("ALERT_MIN_CONFIDENCE") ?? "0.6");

    if (!alertCategories.includes(result.category)) return null;
    if (result.confidence < minConfidence) return null;

    const topMatch = [...result.entities].sort((a, b) => b.confidence - a.confidence)[0];
    const entity = topMatch ? this.resolveEntity(topMatch.name, monitoredEntities) : undefined;
    if (!entity) {
      this.logger.warn("[ALERT] categoría/confianza superan el umbral pero no se pudo resolver la entidad; no se crea alerta");
      return null;
    }

    const alert = await this.prisma.alert.create({
      data: {
        analysisId,
        publicationId: publication.id,
        entityId: entity.id,
        category: result.category,
        severity: result.severity,
        confidence: result.confidence,
        summary: result.summary,
      },
    });

    this.logger.log(`[ALERT] alerta creada (publicationId=${publication.id}, entity=${entity.name})`);

    await this.mailService.sendAlertEmail({
      entityName: entity.name,
      category: result.category,
      severity: result.severity,
      confidence: result.confidence,
      summary: result.summary,
      sourceName,
      publicationTitle: publication.title,
      publicationUrl: publication.url,
    });

    return alert;
  }

  private resolveEntity(
    name: string,
    monitoredEntities: { id: string; name: string; aliases: string[] }[],
  ) {
    const normalize = (value: string) =>
      value
        .normalize("NFKC")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("es");
    const normalized = normalize(name);
    return monitoredEntities.find(
      (e) =>
        normalize(e.name) === normalized ||
        e.aliases.some((alias) => normalize(alias) === normalized),
    );
  }

}
