import { z } from "zod";
export declare const ContentCategorySchema: z.ZodEnum<{
    POSITIVE: "POSITIVE";
    NEUTRAL: "NEUTRAL";
    CRITICISM: "CRITICISM";
    COMPLAINT: "COMPLAINT";
    ALLEGATION: "ALLEGATION";
    DENUNCIA: "DENUNCIA";
    SCANDAL: "SCANDAL";
    OTHER_RELEVANT: "OTHER_RELEVANT";
    IRRELEVANT: "IRRELEVANT";
}>;
export type ContentCategory = z.infer<typeof ContentCategorySchema>;
export declare const SeveritySchema: z.ZodEnum<{
    LOW: "LOW";
    MEDIUM: "MEDIUM";
    HIGH: "HIGH";
}>;
export type Severity = z.infer<typeof SeveritySchema>;
export declare const ClaimTypeSchema: z.ZodEnum<{
    ALLEGATION: "ALLEGATION";
    FACT: "FACT";
    REPORTED_CLAIM: "REPORTED_CLAIM";
    OPINION: "OPINION";
    DENIAL: "DENIAL";
    UNVERIFIED: "UNVERIFIED";
}>;
export type ClaimType = z.infer<typeof ClaimTypeSchema>;
export declare const AnalysisClaimSchema: z.ZodObject<{
    text: z.ZodString;
    type: z.ZodEnum<{
        ALLEGATION: "ALLEGATION";
        FACT: "FACT";
        REPORTED_CLAIM: "REPORTED_CLAIM";
        OPINION: "OPINION";
        DENIAL: "DENIAL";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type AnalysisClaim = z.infer<typeof AnalysisClaimSchema>;
export declare const AnalysisEntityMatchSchema: z.ZodObject<{
    name: z.ZodString;
    confidence: z.ZodNumber;
}, z.core.$strip>;
export type AnalysisEntityMatch = z.infer<typeof AnalysisEntityMatchSchema>;
/** Salida estructurada que debe producir el pipeline de IA (ver skill de contexto, sección "Reglas de negocio invariables"). */
export declare const AnalysisResultSchema: z.ZodObject<{
    relevant: z.ZodBoolean;
    entities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        confidence: z.ZodNumber;
    }, z.core.$strip>>;
    category: z.ZodEnum<{
        POSITIVE: "POSITIVE";
        NEUTRAL: "NEUTRAL";
        CRITICISM: "CRITICISM";
        COMPLAINT: "COMPLAINT";
        ALLEGATION: "ALLEGATION";
        DENUNCIA: "DENUNCIA";
        SCANDAL: "SCANDAL";
        OTHER_RELEVANT: "OTHER_RELEVANT";
        IRRELEVANT: "IRRELEVANT";
    }>;
    severity: z.ZodEnum<{
        LOW: "LOW";
        MEDIUM: "MEDIUM";
        HIGH: "HIGH";
    }>;
    confidence: z.ZodNumber;
    summary: z.ZodString;
    reason: z.ZodString;
    claims: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        type: z.ZodEnum<{
            ALLEGATION: "ALLEGATION";
            FACT: "FACT";
            REPORTED_CLAIM: "REPORTED_CLAIM";
            OPINION: "OPINION";
            DENIAL: "DENIAL";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
