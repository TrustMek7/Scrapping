import { Controller, ForbiddenException, Post, Req, ServiceUnavailableException } from "@nestjs/common";
import type { Request } from "express";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { FacebookService } from "./facebook.service";
import { FacebookAutoCheckService } from "./facebook-auto-check.service";

export function assertLocalControl(request: Pick<Request, "ip" | "headers">) {
  const ip = request.ip;
  const origin = request.headers.origin;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip ?? "") ||
    request.headers['x-scrapping-control'] !== 'shutdown' ||
    (origin && !/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin))) {
    throw new ForbiddenException("El apagado solo está disponible desde la aplicación local.");
  }
}

@Controller("system")
export class SystemController {
  constructor(private readonly facebook: FacebookService, private readonly autoCheck: FacebookAutoCheckService) {}

  @Post("prepare-shutdown")
  prepare(@Req() request: Request) {
    assertLocalControl(request);
    this.autoCheck.stop();
    return this.facebook.prepareShutdown();
  }

  @Post("shutdown")
  shutdown(@Req() request: Request) {
    assertLocalControl(request);
    const root = path.resolve(__dirname, '../../../..');
    try {
      const runtime = JSON.parse(readFileSync(path.join(root, '.runtime.local'), 'utf8'));
      if (runtime.root.toLowerCase() !== root.toLowerCase() || !runtime.supervisor?.pid) throw new Error();
      // The supervisor is a sibling of the servers, so it can stop both trees.
      process.kill(runtime.supervisor.pid, 0);
      this.autoCheck.stop();
      this.facebook.prepareShutdown();
      writeFileSync(path.join(root, '.shutdown-request.local'), runtime.runId, 'utf8');
      return { accepted: true };
    } catch {
      throw new ServiceUnavailableException("No se pudo contactar al supervisor. Ejecuta detener.bat en la carpeta del proyecto.");
    }
  }
}
