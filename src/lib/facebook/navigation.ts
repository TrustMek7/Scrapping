import { withFacebookContext } from "@/lib/facebook/browser";
import { FacebookError } from "@/lib/facebook/errors";
import { extractFacebookPost } from "@/lib/facebook/extractor";
import {
  hasStoredSession,
  isFacebookAuthenticated,
} from "@/lib/facebook/session";
import type { FacebookPost } from "@/lib/facebook/types";
import {
  isAllowedFacebookUrl,
  isFacebookVideoUrl,
  normalizeFacebookPostUrl,
} from "@/lib/facebook/validators";

export async function getFacebookPost(input: unknown) {
  const requestedUrl = normalizeFacebookPostUrl(input);

  if (!(await hasStoredSession())) {
    throw new FacebookError(
      "SESSION_REQUIRED",
      "Necesitas iniciar sesión en Facebook.",
      401,
    );
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
      throw new FacebookError(
        "POST_NOT_ACCESSIBLE",
        "Facebook no pudo mostrar la publicación.",
        403,
      );
    }

    if (!isAllowedFacebookUrl(page.url())) {
      throw new FacebookError(
        "POST_NOT_ACCESSIBLE",
        "Facebook redirigió fuera de una página permitida.",
        403,
      );
    }

    if (isFacebookVideoUrl(page.url())) {
      throw new FacebookError(
        "INVALID_URL",
        "Los videos no forman parte de este piloto.",
        400,
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
      throw new FacebookError(
        "SESSION_EXPIRED",
        "La sesión de Facebook expiró. Inicia sesión nuevamente.",
        401,
      );
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
