import { AnalysisService } from "./analysis.service";
export declare class AnalysisController {
    private readonly analysisService;
    constructor(analysisService: AnalysisService);
    preview(body: unknown): Promise<{
        relevant: boolean;
        entities: {
            name: string;
            confidence: number;
        }[];
        category: "POSITIVE" | "NEUTRAL" | "CRITICISM" | "COMPLAINT" | "ALLEGATION" | "DENUNCIA" | "SCANDAL" | "OTHER_RELEVANT" | "IRRELEVANT";
        severity: "LOW" | "MEDIUM" | "HIGH";
        confidence: number;
        summary: string;
        reason: string;
        claims: {
            text: string;
            type: "ALLEGATION" | "FACT" | "REPORTED_CLAIM" | "OPINION" | "DENIAL" | "UNVERIFIED";
        }[];
    }>;
    run(body: unknown): Promise<{
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
}
