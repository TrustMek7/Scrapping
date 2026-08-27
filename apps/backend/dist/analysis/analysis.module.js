"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisModule = void 0;
const common_1 = require("@nestjs/common");
const analysis_controller_1 = require("./analysis.controller");
const analysis_service_1 = require("./analysis.service");
const ai_provider_interface_1 = require("./ai-provider.interface");
const deepseek_provider_1 = require("./providers/deepseek.provider");
let AnalysisModule = class AnalysisModule {
};
exports.AnalysisModule = AnalysisModule;
exports.AnalysisModule = AnalysisModule = __decorate([
    (0, common_1.Module)({
        controllers: [analysis_controller_1.AnalysisController],
        providers: [analysis_service_1.AnalysisService, deepseek_provider_1.DeepSeekProvider, { provide: ai_provider_interface_1.AI_PROVIDER, useExisting: deepseek_provider_1.DeepSeekProvider }],
        exports: [analysis_service_1.AnalysisService],
    })
], AnalysisModule);
//# sourceMappingURL=analysis.module.js.map