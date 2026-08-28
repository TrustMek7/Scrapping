import * as path from "node:path";

import { chromium, type BrowserContext } from "playwright";

import { FacebookError } from "./errors";

export const FACEBOOK_SESSION_DIR = path.join(
  process.cwd(),
  ".facebook-session",
  process.env.FACEBOOK_SESSION_PROFILE ?? "default",
);

let browserInUse = false;
let lockAcquiredAt: number | null = null;

// El login manual puede tardar hasta LOGIN_TIMEOUT_MS (10 min, ver session.ts) sosteniendo
// el candado legítimamente. Si sigue trabado más que eso, es que algo se colgó (ej. el
// proceso se reinició a mitad de una operación) — mejor auto-liberarlo que exigir un
// reinicio manual del backend cada vez que pasa.
const STALE_LOCK_MS = 11 * 60 * 1000;

export async function runWithBrowserLock<T>(operation: () => Promise<T>) {
  if (browserInUse) {
    const heldForMs = lockAcquiredAt ? Date.now() - lockAcquiredAt : Infinity;
    if (heldForMs < STALE_LOCK_MS) {
      throw new FacebookError(
        "BROWSER_ERROR",
        "El navegador está ocupado. Espera a que termine la operación actual.",
        409,
      );
    }
    console.warn(
      `[Facebook] El candado del navegador llevaba trabado ${Math.round(heldForMs / 1000)}s — se libera solo y se reintenta.`,
    );
  }

  browserInUse = true;
  lockAcquiredAt = Date.now();
  try {
    return await operation();
  } finally {
    browserInUse = false;
    lockAcquiredAt = null;
  }
}

export function withFacebookContext<T>(
  headless: boolean,
  operation: (context: BrowserContext) => Promise<T>,
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
  });
}
