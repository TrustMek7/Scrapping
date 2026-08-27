"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AnalysisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const ai_provider_interface_1 = require("./ai-provider.interface");
let AnalysisService = AnalysisService_1 = class AnalysisService {
    constructor(aiProvider, prisma, config) {
        this.aiProvider = aiProvider;
        this.prisma = prisma;
        this.config = config;
        this.logger = new common_1.Logger(AnalysisService_1.name);
    }
    async preview(input) {
        const monitoredEntities = await this.loadMonitoredEntities();
        return this.aiProvider.analyze({ ...input, monitoredEntities });
    }
    async runAndPersist(input) {
        const contentHash = (0, node_crypto_1.createHash)("sha256").update(input.content).digest("hex");
        const existing = await this.prisma.publication.findUnique({ where: { contentHash } });
        if (existing) {
            this.logger.log(`[SCRAPER] publicación duplicada, se omite (contentHash=${contentHash})`);
            return { publication: existing, analysis: await this.prisma.analysis.findUnique({ where: { publicationId: existing.id } }), alert: null, deduplicated: true };
        }
        const publication = await this.prisma.publication.create({
            data: {
                sourceId: input.sourceId,
                externalId: input.externalId,
                title: input.title,
                content: input.content,
                url: input.url,
                contentHash,
                publishedAt: input.publishedAt,
            },
        });
        const monitoredEntities = await this.prisma.monitoredEntity.findMany();
        let result;
        try {
            result = await this.aiProvider.analyze({
                title: input.title,
                content: input.content,
                sourceName: (await this.prisma.source.findUniqueOrThrow({ where: { id: input.sourceId } })).name,
                publishedAt: input.publishedAt,
                monitoredEntities: monitoredEntities.map((e) => ({ name: e.name, aliases: e.aliases })),
            });
        }
        catch (error) {
            this.logger.error(`[ANALYSIS] falló el análisis: ${error.message}`);
            const analysis = await this.prisma.analysis.create({
                data: {
                    publicationId: publication.id,
                    status: "FAILED",
                    error: error.message,
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
                rawOutput: result,
            },
        });
        await this.linkMatchedEntities(publication.id, result.entities, monitoredEntities);
        const alert = await this.maybeCreateAlert(analysis.id, publication.id, result, monitoredEntities);
        return { publication, analysis, alert, deduplicated: false };
    }
    async loadMonitoredEntities() {
        const entities = await this.prisma.monitoredEntity.findMany();
        return entities.map((e) => ({ name: e.name, aliases: e.aliases }));
    }
    async linkMatchedEntities(publicationId, matches, monitoredEntities) {
        for (const match of matches) {
            const entity = this.resolveEntity(match.name, monitoredEntities);
            if (!entity)
                continue;
            await this.prisma.publicationEntity.upsert({
                where: { publicationId_entityId: { publicationId, entityId: entity.id } },
                create: { publicationId, entityId: entity.id, confidence: match.confidence },
                update: { confidence: match.confidence },
            });
        }
    }
    async maybeCreateAlert(analysisId, publicationId, result, monitoredEntities) {
        if (!result.relevant)
            return null;
        const alertCategories = (this.config.get("ALERT_CATEGORIES") ?? "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
        const minConfidence = Number(this.config.get("ALERT_MIN_CONFIDENCE") ?? "0.7");
        if (!alertCategories.includes(result.category))
            return null;
        if (result.confidence < minConfidence)
            return null;
        const topMatch = [...result.entities].sort((a, b) => b.confidence - a.confidence)[0];
        const entity = topMatch ? this.resolveEntity(topMatch.name, monitoredEntities) : undefined;
        if (!entity) {
            this.logger.warn("[ALERT] categoría/confianza superan el umbral pero no se pudo resolver la entidad; no se crea alerta");
            return null;
        }
        const alert = await this.prisma.alert.create({
            data: {
                analysisId,
                publicationId,
                entityId: entity.id,
                category: result.category,
                severity: result.severity,
                confidence: result.confidence,
                summary: result.summary,
            },
        });
        this.logger.log(`[ALERT] alerta creada (publicationId=${publicationId}, entity=${entity.name})`);
        return alert;
    }
    resolveEntity(name, monitoredEntities) {
        const normalized = name.trim().toLowerCase();
        return monitoredEntities.find((e) => e.name.trim().toLowerCase() === normalized ||
            e.aliases.some((alias) => alias.trim().toLowerCase() === normalized));
    }
};
exports.AnalysisService = AnalysisService;
exports.AnalysisService = AnalysisService = AnalysisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(ai_provider_interface_1.AI_PROVIDER)),
    __metadata("design:paramtypes", [Object, prisma_service_1.PrismaService,
        config_1.ConfigService])
], AnalysisService);
//# sourceMappingURL=analysis.service.js.map