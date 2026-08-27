"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateMonitoredEntitySchema = exports.CreateMonitoredEntitySchema = void 0;
const zod_1 = require("zod");
exports.CreateMonitoredEntitySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    aliases: zod_1.z.array(zod_1.z.string().min(1)).default([]),
});
exports.UpdateMonitoredEntitySchema = exports.CreateMonitoredEntitySchema.partial();
