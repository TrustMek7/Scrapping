import { Controller, Delete, Get, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { FacebookService } from "./facebook.service";

@Controller("facebook")
export class FacebookController {
  constructor(private readonly facebookService: FacebookService) {}

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

  /** Revisa la última publicación de la Source dada y la manda al pipeline de análisis. */
  @Post("sources/:id/check")
  async checkSource(@Param("id") id: string) {
    return this.facebookService.checkLatestFromSource(id);
  }

  /** Revisa todas las Source de tipo FACEBOOK activas, una por una. El fallo de una no detiene a las demás. */
  @Post("sources/check-all")
  async checkAllSources() {
    return this.facebookService.checkAllActiveSources();
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
