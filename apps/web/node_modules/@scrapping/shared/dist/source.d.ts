import { z } from "zod";
export declare const SourceTypeSchema: z.ZodEnum<{
    WEBSITE: "WEBSITE";
    RSS: "RSS";
    FACEBOOK: "FACEBOOK";
    INSTAGRAM: "INSTAGRAM";
    OTHER: "OTHER";
}>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export declare const SourceStatusSchema: z.ZodEnum<{
    ACTIVE: "ACTIVE";
    ERROR: "ERROR";
    DISABLED: "DISABLED";
}>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export declare const CreateSourceSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<{
        WEBSITE: "WEBSITE";
        RSS: "RSS";
        FACEBOOK: "FACEBOOK";
        INSTAGRAM: "INSTAGRAM";
        OTHER: "OTHER";
    }>;
    url: z.ZodString;
}, z.core.$strip>;
export type CreateSourceInput = z.infer<typeof CreateSourceSchema>;
export declare const UpdateSourceSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<{
        WEBSITE: "WEBSITE";
        RSS: "RSS";
        FACEBOOK: "FACEBOOK";
        INSTAGRAM: "INSTAGRAM";
        OTHER: "OTHER";
    }>>;
    url: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        ERROR: "ERROR";
        DISABLED: "DISABLED";
    }>>;
}, z.core.$strip>;
export type UpdateSourceInput = z.infer<typeof UpdateSourceSchema>;
