import { z } from "zod";

export const CreateMonitoredEntitySchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
});
export type CreateMonitoredEntityInput = z.infer<typeof CreateMonitoredEntitySchema>;

export const UpdateMonitoredEntitySchema = CreateMonitoredEntitySchema.partial();
export type UpdateMonitoredEntityInput = z.infer<typeof UpdateMonitoredEntitySchema>;
