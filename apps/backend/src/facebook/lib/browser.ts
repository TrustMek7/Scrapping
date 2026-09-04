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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new FacebookError(
            "BROWSER_ERROR",
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
    let context: BrowserContext | null = null;

    try {
      context = await chromium.launchPersistentContext(FACEBOOK_SESSION_DIR, {
        headless,
      });
      context.setDefaultTimeout(15_000);
      context.setDefaultNavigationTimeout(45_000);
      return await operation(context);
    } catch (error) {
      if (error instanceof FacebookError) {
        throw error;
      }

      console.error("[Facebook] Browser operation failed", error);
      throw new FacebookError(
        "BROWSER_ERROR",
        "No se pudo completar la operación del navegador.",
      );
    } finally {
      await context?.close().catch(() => undefined);
    }
  }, timeoutMs);
}
