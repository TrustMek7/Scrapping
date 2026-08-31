import { Injectable, Logger } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { FacebookService } from "./facebook.service";

const JOB_NAME = "facebook-auto-check";
const DEFAULT_INTERVAL_MINUTES = 60;

export interface AutoCheckStatus {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
}

/**
 * Prender/apagar la revisión automática de todas las fuentes de Facebook a
 * un intervalo fijo. Estado en memoria a propósito (no en la base): si el
 * backend se reinicia, queda apagada y hay que volver a prenderla desde el
 * dashboard — más simple que persistirla, aceptable para una herramienta de
 * un solo usuario. Reutiliza el mismo checkAllActiveSources() del botón
 * manual — no hay una ruta "automática" separada, ni evasión de nada: si
 * Facebook pide volver a loguearse, esto simplemente va a fallar y quedar
 * registrado en cada Source, igual que un chequeo manual fallido.
 */
@Injectable()
export class FacebookAutoCheckService {
  private readonly logger = new Logger(FacebookAutoCheckService.name);
  private intervalMinutes = DEFAULT_INTERVAL_MINUTES;
  private lastRunAt: Date | null = null;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly facebookService: FacebookService,
  ) {}

  getStatus(): AutoCheckStatus {
    return {
      enabled: this.schedulerRegistry.doesExist("interval", JOB_NAME),
      intervalMinutes: this.intervalMinutes,
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
    };
  }

  start(intervalMinutes = DEFAULT_INTERVAL_MINUTES): AutoCheckStatus {
    this.stop();
    this.intervalMinutes = intervalMinutes;

    const interval = setInterval(() => {
      this.lastRunAt = new Date();
      this.logger.log(`[FACEBOOK][auto] revisión automática (cada ${this.intervalMinutes} min)`);
      this.facebookService.checkAllActiveSources().catch((error) => {
        this.logger.error(`[FACEBOOK][auto] falló la revisión automática: ${(error as Error).message}`);
      });
    }, intervalMinutes * 60_000);

    this.schedulerRegistry.addInterval(JOB_NAME, interval);
    this.logger.log(`[FACEBOOK][auto] activada, cada ${intervalMinutes} minuto(s)`);
    return this.getStatus();
  }

  stop(): AutoCheckStatus {
    if (this.schedulerRegistry.doesExist("interval", JOB_NAME)) {
      this.schedulerRegistry.deleteInterval(JOB_NAME);
      this.logger.log("[FACEBOOK][auto] desactivada");
    }
    return this.getStatus();
  }
}
