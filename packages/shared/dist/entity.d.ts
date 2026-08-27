import { z } from "zod";
export declare const CreateMonitoredEntitySchema: z.ZodObject<{
    name: z.ZodString;
    aliases: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CreateMonitoredEntityInput = z.infer<typeof CreateMonitoredEntitySchema>;
export declare const UpdateMonitoredEntitySchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    aliases: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString>>>;
}, z.core.$strip>;
export type UpdateMonitoredEntityInput = z.infer<typeof UpdateMonitoredEntitySchema>;
