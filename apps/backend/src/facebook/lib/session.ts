import { access, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";

import type { BrowserContext, Page } from "playwright";

import { FACEBOOK_SESSION_DIR, runWithBrowserLock, withFacebookContext } from "./browser";
import { FacebookError } from "./errors";

const FACEBOOK_HOME = "https://www.facebook.com/";
const SESSION_MARKER = path.join(FACEBOOK_SESSION_DIR, ".authenticated");
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export type FacebookSessionStatus = "active" | "required" | "expired";

let pendingSessionCheck: Promise<FacebookSessionStatus> | null = null;

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isFacebookAuthenticated(context: BrowserContext, page: Page) {
  const cookies = await context.cookies(FACEBOOK_HOME);
  const hasUserSession = cookies.some((cookie) => cookie.name === "c_user");
  const authenticationPage = /\/(login|checkpoint|recover)(\/|\.php|$)/i.test(
    new URL(page.url()).pathname,
  );
  const loginForm = await page
    .locator('input[name="email"], input[name="pass"]')
    .first()
    .isVisible()
    .catch(() => false);

  return hasUserSession && !authenticationPage && !loginForm;
}

async function openFacebook(context: BrowserContext) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(FACEBOOK_HOME, { waitUntil: "domcontentloaded" });
  return page;
}

export function checkSession(): Promise<FacebookSessionStatus> {
  if (pendingSessionCheck) return pendingSessionCheck;

  pendingSessionCheck = (async () => {
    console.info("[Facebook] Checking session...");

    if (!(await exists(SESSION_MARKER))) {
      console.info("[Facebook] Session required");
      return "required";
    }

    return withFacebookContext<FacebookSessionStatus>(true, async (context) => {
      const page = await openFacebook(context);
      const status = (await isFacebookAuthenticated(context, page)) ? "active" : "expired";
      console.info(`[Facebook] Session ${status}`);
      return status;
    });
  })().finally(() => {
    pendingSessionCheck = null;
  });

  return pendingSessionCheck;
}

export async function startLogin(): Promise<FacebookSessionStatus> {
  console.info("[Facebook] Opening Facebook for manual login...");

  return withFacebookContext<FacebookSessionStatus>(false, async (context) => {
    const page = await openFacebook(context);
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (page.isClosed()) {
        throw new FacebookError(
          "SESSION_REQUIRED",
          "El inicio de sesión fue cancelado.",
          401,
        );
      }

      if (await isFacebookAuthenticated(context, page)) {
        await writeFile(SESSION_MARKER, new Date().toISOString(), "utf8");
        console.info("[Facebook] Session active");
        return "active";
      }

      await page.waitForTimeout(1_000);
    }

    throw new FacebookError(
      "SESSION_REQUIRED",
      "No se completó el inicio de sesión dentro del tiempo disponible.",
      408,
    );
  });
}

export function hasStoredSession() {
  return exists(SESSION_MARKER);
}

export function resetSession(): Promise<FacebookSessionStatus> {
  return runWithBrowserLock<FacebookSessionStatus>(async () => {
    await rm(FACEBOOK_SESSION_DIR, { recursive: true, force: true });
    console.info("[Facebook] Session reset");
    return "required";
  });
}
