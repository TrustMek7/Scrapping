import * as path from "node:path";

import { chromium, type BrowserContext } from "playwright";

import { FacebookError } from "./errors";

export const FACEBOOK_SESSION_DIR = path.join(
  process.cwd(),
  ".facebook-session",
  process.env.FACEBOOK_SESSION_PROFILE ?? "default",
);

// El login manual puede tardar hasta LOGIN_TIMEOUT_MS (10 min, ver session.ts)
// sosteniendo el navegador legítimamente — el margen de cada operación en
// cola tiene que cubrir eso.
const OPERATION_TIMEOUT_MS = 11 * 60 * 1000;

let queueTail: Promise<void> = Promise.resolve();
const activeContexts = new Set<BrowserContext>();
let shuttingDown = false;
export async function stopFacebookBrowsers() {
  shuttingDown = true;
  await Promise.allSettled([...activeContexts].map(context => context.close()));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new FacebookError(
            "TIMEOUT",
            "La operación de Facebook tardó demasiado y se canceló.",
            504,
          ),
        ),
      ms,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutHandle));
}

/**
 * Cola FIFO en vez de "el navegador está ocupado, reintentá vos": si ya hay
 * una operación de Facebook en curso, la nueva simplemente espera su turno.
 * Importante para "revisar todas las fuentes" — antes, una fuente podía
 * fallar por encontrar el candado ocupado por otra operación concurrente
 * (ej. la revisión automática horaria disparándose al mismo tiempo). Cada
 * operación individual tiene un tiempo máximo (mismo margen que el login
 * manual) para que una que se cuelgue no bloquee la cola para siempre.
 */
export function runWithBrowserLock<T>(
  operation: () => Promise<T>,
  timeoutMs: number = OPERATION_TIMEOUT_MS,
): Promise<T> {
  const run = queueTail.then(() => withTimeout(operation(), timeoutMs));
  // La cola sigue pase lo que pase (éxito o error) — nunca se traba por el
  // fallo de una operación individual.
  queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * `timeoutMs` es por-operación: quien procesa varias fuentes dentro de UN
 * solo `withFacebookContext` (ver `checkAllActiveSources`) debe pasar un
 * margen que escale con la cantidad de fuentes — el default (pensado para
 * una sola fuente o el login manual) se quedaría corto para un lote grande.
 */
export function withFacebookContext<T>(
  headless: boolean,
  operation: (context: BrowserContext) => Promise<T>,
  timeoutMs: number = OPERATION_TIMEOUT_MS,
) {
  return runWithBrowserLock(async () => {
    if (shuttingDown) throw new FacebookError("BROWSER_ERROR", "El sistema se está apagando.");
    let context: BrowserContext | null = null;

    try {
      const launchStartedAt = Date.now();
      context = await chromium.launchPersistentContext(FACEBOOK_SESSION_DIR, {
        headless,
      });
      activeContexts.add(context);
      if (shuttingDown) throw new FacebookError("BROWSER_ERROR", "El sistema se está apagando.");
      console.info(`[Facebook][tiempo] iniciar Chromium: ${Date.now() - launchStartedAt} ms`);
      context.setDefaultTimeout(15_000);
      context.setDefaultNavigationTimeout(45_000);
      // Expire the operation inside the context's try/finally so Chromium is
      // closed before the caller marks the review as finished.
      return await withTimeout(operation(context), timeoutMs);
    } catch (error) {
      if (error instanceof FacebookError) {
        throw error;
      }

      console.error("[Facebook] Browser operation failed", error);
      const message = error instanceof Error ? error.message : "";
      if (/net::ERR_|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(message)) {
        throw new FacebookError("CONNECTION_ERROR", "No se pudo conectar con Facebook. Revisa la conexión a internet o la disponibilidad del servicio.", 503);
      }
      if (/Target page, context or browser has been closed|Target closed|Browser has been closed/i.test(message)) {
        throw new FacebookError(
          "BROWSER_ERROR",
          "El navegador de Facebook se cerró durante la revisión. Inicia otra revisión.",
          503,
        );
      }
      if (/timeout|timed out/i.test(message)) {
        throw new FacebookError("TIMEOUT", "Facebook no respondió dentro del tiempo de espera.", 504);
      }
      throw new FacebookError(
        "BROWSER_ERROR",
        "No se pudo completar la operación del navegador.",
      );
    } finally {
      await context?.close().catch(() => undefined);
      if (context) activeContexts.delete(context);
    }
  }, timeoutMs + 60000);
}
