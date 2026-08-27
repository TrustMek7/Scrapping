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
var DeepSeekProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSeekProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = require("openai");
const shared_1 = require("@scrapping/shared");
const analyze_prompt_1 = require("../prompts/analyze.prompt");
let DeepSeekProvider = DeepSeekProvider_1 = class DeepSeekProvider {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(DeepSeekProvider_1.name);
        this.client = new openai_1.default({
            apiKey: this.config.get("DEEPSEEK_API_KEY"),
            baseURL: "https://api.deepseek.com",
        });
        this.model = this.config.get("DEEPSEEK_MODEL") ?? "deepseek-v4-flash";
    }
    async analyze(input) {
        const response = await this.client.chat.completions.create({
            model: this.model,
            max_tokens: 4096,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: analyze_prompt_1.ANALYSIS_SYSTEM_PROMPT },
                { role: "user", content: (0, analyze_prompt_1.buildAnalysisUserPrompt)(input) },
            ],
        });
        const raw = response.choices[0]?.message?.content;
        if (!raw) {
            throw new Error("DeepSeek devolvió una respuesta vacía.");
        }
        let candidate;
        try {
            candidate = JSON.parse(raw);
        }
        catch {
            this.logger.error(`Respuesta no es JSON válido: ${raw.slice(0, 500)}`);
            throw new Error("La salida de la IA no es JSON válido.");
        }
        const parsed = shared_1.AnalysisResultSchema.safeParse(candidate);
        if (!parsed.success) {
            this.logger.error(`La salida no cumple el esquema esperado: ${parsed.error.message}`);
            throw new Error("La salida de la IA no cumplió el esquema esperado.");
        }
        return parsed.data;
    }
};
exports.DeepSeekProvider = DeepSeekProvider;
exports.DeepSeekProvider = DeepSeekProvider = DeepSeekProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DeepSeekProvider);
//# sourceMappingURL=deepseek.provider.js.map