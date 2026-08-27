"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const analysis_service_1 = require("./analysis.service");
const previewSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    content: zod_1.z.string().min(1),
    sourceName: zod_1.z.string().min(1),
    publishedAt: zod_1.z.coerce.date().optional(),
});
const runSchema = zod_1.z.object({
    sourceId: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    content: zod_1.z.string().min(1),
    url: zod_1.z.string().url(),
    externalId: zod_1.z.string().optional(),
    publishedAt: zod_1.z.coerce.date().optional(),
});
let AnalysisController = class AnalysisController {
    constructor(analysisService) {
        this.analysisService = analysisService;
    }
    async preview(body) {
        const parsed = previewSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.flatten());
        }
        return this.analysisService.preview(parsed.data);
    }
    async run(body) {
        const parsed = runSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.flatten());
        }
        return this.analysisService.runAndPersist(parsed.data);
    }
};
exports.AnalysisController = AnalysisController;
__decorate([
    (0, common_1.Post)("preview"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalysisController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)("run"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalysisController.prototype, "run", null);
exports.AnalysisController = AnalysisController = __decorate([
    (0, common_1.Controller)("analysis"),
    __metadata("design:paramtypes", [analysis_service_1.AnalysisService])
], AnalysisController);
//# sourceMappingURL=analysis.controller.js.map