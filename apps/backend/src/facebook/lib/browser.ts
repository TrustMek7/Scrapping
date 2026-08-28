import * as path from "node:path";

import { chromium, type BrowserContext } from "playwright";

import { FacebookError } from "./errors";

export const FACEBOOK_SESSION_DIR = path.join(
  process.cwd(),
  ".facebook-session",
  process.env.FACEBOOK_SESSION_PROFILE ?? "default",
);

let browserInUse = false;

export async function runWithBrowserLock<T>(operation: () => Promise<T>) {
  // Un solo proceso local y una sola operación de navegador a la vez alcanza para este piloto.
  if (browserInUse) {
    throw new FacebookError(
      "BROWSER_ERROR",
      "El navegador está ocupado. Espera a que termine la operación actual.",
      409,
    );
  }

  browserInUse = true;
  try {
    return await operation();
  } finally {
    browserInUse = false;
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
