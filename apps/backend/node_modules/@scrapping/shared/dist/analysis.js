"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisResultSchema = exports.AnalysisEntityMatchSchema = exports.AnalysisClaimSchema = exports.ClaimTypeSchema = exports.SeveritySchema = exports.ContentCategorySchema = void 0;
const zod_1 = require("zod");
exports.ContentCategorySchema = zod_1.z.enum([
    "POSITIVE",
    "NEUTRAL",
    "CRITICISM",
    "COMPLAINT",
    "ALLEGATION",
    "DENUNCIA",
    "SCANDAL",
    "OTHER_RELEVANT",
    "IRRELEVANT",
]);
exports.SeveritySchema = zod_1.z.enum(["LOW", "MEDIUM", "HIGH"]);
exports.ClaimTypeSchema = zod_1.z.enum([
    "FACT",
    "REPORTED_CLAIM",
    "OPINION",
    "ALLEGATION",
    "DENIAL",
    "UNVERIFIED",
]);
exports.AnalysisClaimSchema = zod_1.z.object({
    text: zod_1.z.string(),
    type: exports.ClaimTypeSchema,
});
exports.AnalysisEntityMatchSchema = zod_1.z.object({
    name: zod_1.z.string(),
    confidence: zod_1.z.number().min(0).max(1),
});
/** Salida estructurada que debe producir el pipeline de IA (ver skill de contexto, sección "Reglas de negocio invariables"). */
exports.AnalysisResultSchema = zod_1.z.object({
    relevant: zod_1.z.boolean(),
    entities: zod_1.z.array(exports.AnalysisEntityMatchSchema),
    category: exports.ContentCategorySchema,
    severity: exports.SeveritySchema,
    confidence: zod_1.z.number().min(0).max(1),
    summary: zod_1.z.string(),
    reason: zod_1.z.string(),
    claims: zod_1.z.array(exports.AnalysisClaimSchema),
});
