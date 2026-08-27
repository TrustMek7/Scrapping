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
exports.SourcesController = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@scrapping/shared");
const prisma_service_1 = require("../prisma/prisma.service");
let SourcesController = class SourcesController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    findAll() {
        return this.prisma.source.findMany({ orderBy: { createdAt: "desc" } });
    }
    async findOne(id) {
        const source = await this.prisma.source.findUnique({ where: { id } });
        if (!source)
            throw new common_1.NotFoundException("Fuente no encontrada");
        return source;
    }
    create(body) {
        const parsed = shared_1.CreateSourceSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.flatten());
        return this.prisma.source.create({ data: parsed.data });
    }
    async update(id, body) {
        const parsed = shared_1.UpdateSourceSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.flatten());
        await this.ensureExists(id);
        return this.prisma.source.update({ where: { id }, data: parsed.data });
    }
    async remove(id) {
        await this.ensureExists(id);
        await this.prisma.source.delete({ where: { id } });
        return { deleted: true };
    }
    async ensureExists(id) {
        const source = await this.prisma.source.findUnique({ where: { id } });
        if (!source)
            throw new common_1.NotFoundException("Fuente no encontrada");
    }
};
exports.SourcesController = SourcesController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SourcesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SourcesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SourcesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SourcesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SourcesController.prototype, "remove", null);
exports.SourcesController = SourcesController = __decorate([
    (0, common_1.Controller)("sources"),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SourcesController);
//# sourceMappingURL=sources.controller.js.map