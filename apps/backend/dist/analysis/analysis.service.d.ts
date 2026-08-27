import { ConfigService } from "@nestjs/config";
import { AnalysisResult } from "@scrapping/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AIProvider } from "./ai-provider.interface";
export interface RunAnalysisInput {
    sourceId: string;
    title: string;
    content: string;
    url: string;
    externalId?: string;
    publishedAt?: Date;
}
export declare class AnalysisService {
    private readonly aiProvider;
    private readonly prisma;
    private readonly config;
    private readonly logger;
    constructor(aiProvider: AIProvider, prisma: PrismaService, config: ConfigService);
    preview(input: {
        title: string;
        content: string;
        sourceName: string;
        publishedAt?: Date;
    }): Promise<AnalysisResult>;
    runAndPersist(input: RunAnalysisInput): Promise<{
        publication: {
            id: string;
            sourceId: string;
            externalId: string | null;
            title: string;
            content: string;
            url: string;
            canonicalUrl: string | null;
            contentHash: string;
            publishedAt: Date | null;
            createdAt: Date;
        };
        analysis: {
            error: string | null;
            relevant: boolean | null;
            category: import("@prisma/client").$Enums.ContentCategory | null;
            severity: import("@prisma/client").$Enums.Severity | null;
            confidence: number | null;
            summary: string | null;
            reason: string | null;
            claims: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            publicationId: string;
            status: import("@prisma/client").$Enums.AnalysisStatus;
            rawOutput: import("@prisma/client/runtime/library").JsonValue | null;
        } | null;
        alert: null;
        deduplicated: boolean;
    } | {
        publication: {
            id: string;
            sourceId: string;
            externalId: string | null;
            title: string;
            content: string;
            url: string;
            canonicalUrl: string | null;
            contentHash: string;
            publishedAt: Date | null;
            createdAt: Date;
        };
        analysis: {
            error: string | null;
            relevant: boolean | null;
            category: import("@prisma/client").$Enums.ContentCategory | null;
            severity: import("@prisma/client").$Enums.Severity | null;
            confidence: number | null;
            summary: string | null;
            reason: string | null;
            claims: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            publicationId: string;
            status: import("@prisma/client").$Enums.AnalysisStatus;
            rawOutput: import("@prisma/client/runtime/library").JsonValue | null;
        };
        alert: {
            category: import("@prisma/client").$Enums.ContentCategory;
            severity: import("@prisma/client").$Enums.Severity;
            confidence: number;
            summary: string;
            id: string;
            createdAt: Date;
            publicationId: string;
            analysisId: string;
            entityId: string;
        } | null;
        deduplicated: boolean;
    }>;
    private loadMonitoredEntities;
    private linkMatchedEntities;
    private maybeCreateAlert;
    private resolveEntity;
}
