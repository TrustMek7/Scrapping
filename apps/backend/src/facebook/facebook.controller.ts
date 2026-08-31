import { Body, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { FacebookService } from "./facebook.service";
import { FacebookAutoCheckService } from "./facebook-auto-check.service";

function parseLimit(limit?: string): number | undefined {
  const parsed = Number(limit);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

@Controller("facebook")
export class FacebookController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly autoCheckService: FacebookAutoCheckService,
  ) {}

  @Get("session")
  async getSession() {
    return { status: await this.facebookService.checkSessionStatus() };
  }

  @Post("session")
  async login() {
    return { status: await this.facebookService.login() };
  }

  @Delete("session")
  async logout() {
    return { status: await this.facebookService.logout() };
  }

  /** Revisa hasta `limit` publicaciones nuevas de la Source dada (default 10) y las manda al pipeline de análisis. */
  @Post("sources/:id/check")
  async checkSource(@Param("id") id: string, @Query("limit") limit?: string) {
    return this.facebookService.checkLatestFromSource(id, parseLimit(limit));
  }

  /** Revisa todas las Source de tipo FACEBOOK activas, una por una. El fallo de una no detiene a las demás. */
  @Post("sources/check-all")
  async checkAllSources(@Query("limit") limit?: string) {
    return this.facebookService.checkAllActiveSources(parseLimit(limit));
  }

  /** Estado de la revisión automática (prendida/apagada, cada cuánto). */
  @Get("auto-check")
  getAutoCheckStatus() {
    return this.autoCheckService.getStatus();
  }

  /** Prende o apaga la revisión automática de todas las fuentes activas. */
  @Post("auto-check")
  setAutoCheck(@Body() body: { enabled: boolean; intervalMinutes?: number }) {
    return body.enabled ? this.autoCheckService.start(body.intervalMinutes) : this.autoCheckService.stop();
  }

  @Get("images/:id")
  getImage(@Param("id") id: string, @Res() res: Response) {
    const image = this.facebookService.getImage(id);

    if (!image) {
      res.status(404).json({ error: { code: "POST_NOT_FOUND", message: "La imagen ya no está disponible." } });
      return;
    }

    res.set({
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=900",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(Buffer.from(image.body));
  }
}
