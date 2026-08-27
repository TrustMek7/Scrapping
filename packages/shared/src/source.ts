import { z } from "zod";

export const SourceTypeSchema = z.enum(["WEBSITE", "RSS", "FACEBOOK", "INSTAGRAM", "OTHER"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceStatusSchema = z.enum(["ACTIVE", "ERROR", "DISABLED"]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const CreateSourceSchema = z.object({
  name: z.string().min(1),
  type: SourceTypeSchema,
  url: z.string().url(),
});
export type CreateSourceInput = z.infer<typeof CreateSourceSchema>;

export const UpdateSourceSchema = z.object({
  name: z.string().min(1).optional(),
  type: SourceTypeSchema.optional(),
  url: z.string().url().optional(),
  status: SourceStatusSchema.optional(),
});
export type UpdateSourceInput = z.infer<typeof UpdateSourceSchema>;
