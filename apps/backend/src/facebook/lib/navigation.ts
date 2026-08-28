import { withFacebookContext } from "./browser";
import { FacebookError } from "./errors";
import { extractFacebookPost, extractLatestFeedPost } from "./extractor";
import { hasStoredSession, isFacebookAuthenticated } from "./session";
import type { FacebookPost } from "./types";
import {
  isAllowedFacebookUrl,
  isFacebookVideoUrl,
  normalizeFacebookPageUrl,
  normalizeFacebookPostUrl,
} from "./validators";

export async function getFacebookPost(input: unknown) {
  const requestedUrl = normalizeFacebookPostUrl(input);

  if (!(await hasStoredSession())) {
    throw new FacebookError("SESSION_REQUIRED", "Necesitas iniciar sesión en Facebook.", 401);
  }

  console.info("[Facebook] Opening post...");
  return withFacebookContext<FacebookPost>(true, async (context) => {
    const page = context.pages()[0] ?? (await context.newPage());

    await page.route("**/*", async (route) => {
      const request = route.request();
      const mainNavigation =
        request.isNavigationRequest() && request.frame() === page.mainFrame();

      if (mainNavigation && !isAllowedFacebookUrl(request.url())) {
        console.warn("[Facebook] Blocked navigation outside facebook.com");
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    });

    console.info("[Facebook] Waiting for post...");
    const response = await page.goto(requestedUrl, { waitUntil: "domcontentloaded" });

    if (response?.status() === 404) {
      throw new FacebookError("POST_NOT_FOUND", "La publicación no existe.", 404);
    }

    if (response && response.status() >= 500) {
      throw new FacebookError("POST_NOT_ACCESSIBLE", "Facebook no pudo mostrar la publicación.", 403);
    }

    if (!isAllowedFacebookUrl(page.url())) {
      throw new FacebookError(
        "POST_NOT_ACCESSIBLE",
        "Facebook redirigió fuera de una página permitida.",
        403,
      );
    }

    if (isFacebookVideoUrl(page.url())) {
      throw new FacebookError("INVALID_URL", "Los videos no forman parte de este piloto.", 400);
    }

    if (/\/(login|checkpoint|recover)(\/|\.php|$)/i.test(new URL(page.url()).pathname)) {
      throw new FacebookError(
        "SESSION_EXPIRED",
        "Facebook requiere que vuelvas a iniciar sesión manualmente.",
        401,
      );
    }

    if (!(await isFacebookAuthenticated(context, page))) {
      throw new FacebookError("SESSION_EXPIRED", "La sesión de Facebook expiró. Inicia sesión nuevamente.", 401);
    }

    const unavailable = page
      .locator('[role="dialog"]:visible, [role="main"]')
      .getByText(
        /(?:contenido|página) no (?:está|se encuentra) disponible|content isn't available|page isn't available|link you followed may be broken|sorry, something went wrong|lo sentimos, se produjo un error/i,
      )
      .first();

    if (await unavailable.isVisible().catch(() => false)) {
      throw new FacebookError(
        "POST_NOT_ACCESSIBLE",
        "La publicación no está disponible o no tienes permiso para verla.",
        403,
      );
    }

    console.info("[Facebook] Post opened successfully");
    const post = await extractFacebookPost(page);
    return { ...post, url: requestedUrl };
  });
}

/**
 * Navega a la URL de una página/perfil (no un post puntual) y extrae la
 * publicación más reciente visible en su timeline. Best-effort: el timeline
 * de una página es menos predecible que la vista de un post individual.
 */
export async function getLatestPagePost(input: unknown) {
  const requestedUrl = normalizeFacebookPageUrl(input);

  if (!(await hasStoredSession())) {
    throw new FacebookError("SESSION_REQUIRED", "Necesitas iniciar sesión en Facebook.", 401);
  }

  console.info("[Facebook] Opening page...");
  return withFacebookContext<FacebookPost>(true, async (context) => {
    const page = context.pages()[0] ?? (await context.newPage());

    await page.route("**/*", async (route) => {
      const request = route.request();
      const mainNavigation =
        request.isNavigationRequest() && request.frame() === page.mainFrame();

      if (mainNavigation && !isAllowedFacebookUrl(request.url())) {
        console.warn("[Facebook] Blocked navigation outside facebook.com");
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    });

    console.info("[Facebook] Waiting for page...");
    const response = await page.goto(requestedUrl, { waitUntil: "domcontentloaded" });

    if (response?.status() === 404) {
      throw new FacebookError("POST_NOT_FOUND", "La página no existe.", 404);
    }

    if (response && response.status() >= 500) {
      throw new FacebookError("POST_NOT_ACCESSIBLE", "Facebook no pudo mostrar la página.", 403);
    }

    if (!isAllowedFacebookUrl(page.url())) {
      throw new FacebookError(
        "POST_NOT_ACCESSIBLE",
        "Facebook redirigió fuera de una página permitida.",
        403,
      );
    }

    if (/\/(login|checkpoint|recover)(\/|\.php|$)/i.test(new URL(page.url()).pathname)) {
      throw new FacebookError(
        "SESSION_EXPIRED",
        "Facebook requiere que vuelvas a iniciar sesión manualmente.",
        401,
      );
    }

    if (!(await isFacebookAuthenticated(context, page))) {
      throw new FacebookError("SESSION_EXPIRED", "La sesión de Facebook expiró. Inicia sesión nuevamente.", 401);
    }

    const unavailable = page
      .locator('[role="main"]')
      .getByText(
        /(?:contenido|página) no (?:está|se encuentra) disponible|content isn't available|page isn't available|lo sentimos, se produjo un error/i,
      )
      .first();

    if (await unavailable.isVisible().catch(() => false)) {
      throw new FacebookError(
        "POST_NOT_ACCESSIBLE",
        "La página no está disponible o no tienes permiso para verla.",
        403,
      );
    }

    console.info("[Facebook] Page opened successfully");
    // A diferencia de getFacebookPost() (URL de post explícita), acá NO rechazamos
    // videos: si la última publicación es un video, igual devolvemos su texto/caption
    // (si tiene) e ignoramos el video en sí — extractLatestFeedPost nunca intenta
    // descargar video, solo texto e imágenes.
    return extractLatestFeedPost(page);
  });
}
