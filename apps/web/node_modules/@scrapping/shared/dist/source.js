"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateSourceSchema = exports.CreateSourceSchema = exports.SourceStatusSchema = exports.SourceTypeSchema = void 0;
const zod_1 = require("zod");
exports.SourceTypeSchema = zod_1.z.enum(["WEBSITE", "RSS", "FACEBOOK", "INSTAGRAM", "OTHER"]);
exports.SourceStatusSchema = zod_1.z.enum(["ACTIVE", "ERROR", "DISABLED"]);
exports.CreateSourceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    type: exports.SourceTypeSchema,
    url: zod_1.z.string().url(),
});
exports.UpdateSourceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    type: exports.SourceTypeSchema.optional(),
    url: zod_1.z.string().url().optional(),
    status: exports.SourceStatusSchema.optional(),
});
