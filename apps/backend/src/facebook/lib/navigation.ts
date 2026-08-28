import type { Page } from "playwright";

import { withFacebookContext } from "./browser";
import { FacebookError } from "./errors";
import { dumpDebugPage, extractFacebookPost } from "./extractor";
import { hasStoredSession, isFacebookAuthenticated } from "./session";
import type { FacebookPost } from "./types";
import {
  isAllowedFacebookUrl,
  isFacebookVideoUrl,
  normalizeFacebookPageUrl,
  normalizeFacebookPostUrl,
} from "./validators";

/** Rechazos compartidos por ambos tipos de link — evidencia real de qué NO es una publicación puntual. */
function isRejectedLink(url: URL): boolean {
  // Links de notificación tipo "te mencionaron en un comentario"
  // (?notif_id=...&notif_t=comment_mention): apuntan a la publicación de OTRA
  // persona, no de la fuente que estamos revisando.
  if (url.searchParams.has("notif_id") || url.searchParams.get("ref") === "notif") {
    return true;
  }
  // Páginas de exploración de hashtag (/watch/hashtag/yunguyo/): "contienen"
  // /watch/ pero no son ninguna publicación puntual.
  if (/^\/(?:watch\/)?hashtag\//.test(url.pathname)) {
    return true;
  }
  return false;
}

/**
 * Camino NORMAL: post de texto/foto o publicación compartida. Se prueba
 * SIEMPRE primero — es el caso más común y el más confiable (nunca tuvo los
 * problemas de video/en vivo).
 */
function isNormalPostLink(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, "https://www.facebook.com");
  } catch {
    return false;
  }
  if (isRejectedLink(url)) return false;

  return (
    isShareLinkPath(url.pathname) ||
    /\/posts\//.test(url.pathname) ||
    /\/permalink\.php$/.test(url.pathname) ||
    /\/photos\//.test(url.pathname) ||
    url.searchParams.has("story_fbid")
  );
}

/**
 * Excepción condicional: SOLO se prueba si el camino normal no encontró
 * nada — video/reel/en vivo tienen un layout completamente distinto (sin
 * diálogo aislado) y han sido la única fuente de falsos positivos hasta
 * ahora, así que nunca deben competir con ni reemplazar al camino normal.
 */
function isVideoOrLiveLink(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, "https://www.facebook.com");
  } catch {
    return false;
  }
  if (isRejectedLink(url)) return false;

  return (
    /\/videos\//.test(url.pathname) ||
    /^\/reel\//.test(url.pathname) ||
    (/^\/watch\/?$/.test(url.pathname) && url.searchParams.has("v"))
  );
}

/** /share/p/{code}/ y /share/{code}/ — links de "publicación compartida", con un código opaco sin id de página. */
function isShareLinkPath(pathname: string): boolean {
  return /^\/share\/(?:p\/)?[a-zA-Z0-9]+\/?$/.test(pathname);
}

/** Saca el identificador de página/perfil (slug o id numérico) de una URL de página ya validada. */
function extractPageSegment(pageUrl: string): string | null {
  const url = new URL(pageUrl);

  if (url.pathname === "/profile.php") return url.searchParams.get("id");

  const peopleMatch = url.pathname.match(/^\/people\/[^/]+\/(\d+)\/?$/);
  if (peopleMatch) return peopleMatch[1];

  const slugMatch = url.pathname.match(/^\/([^/]+)\/?$/);
  return slugMatch ? slugMatch[1] : null;
}

/**
 * Igual que exigir que el link contenga el id/slug de la página (para
 * descartar contenido de otra página) — salvo para /share/..., que son
 * códigos opacos sin ningún id de página en la URL, así que para esos
 * confiamos en que ya vinieron escaneados dentro del feed/main de la propia
 * página (o del JSON filtrado a mano).
 */
function belongsToPage(href: string, pageSegment: string | null): boolean {
  if (!pageSegment) return true;
  try {
    if (isShareLinkPath(new URL(href, "https://www.facebook.com").pathname)) return true;
  } catch {
    return false;
  }
  return href.includes(pageSegment);
}

/**
 * Mientras un video está en vivo, Facebook usa /watch/live/?v={id} como su
 * permalink "canónico" — pero esa URL es específica del estado "en vivo": una
 * vez termina la transmisión, el link estable de siempre disponible es
 * /{página}/videos/{id}/. Normalizamos a ese formato para lo que guardamos,
 * aunque hayamos navegado a /watch/live/ para poder extraer el contenido.
 */
function normalizeVideoPermalink(href: string, pageUrl: string): string {
  const url = new URL(href);
  if (!/^\/watch\/?$/.test(url.pathname)) return href;

  const videoId = url.searchParams.get("v");
  const pageSegment = extractPageSegment(pageUrl);
  if (!videoId || !pageSegment) return href;

  return `https://www.facebook.com/${pageSegment}/videos/${videoId}/`;
}

/** Quita parámetros de comentarios/tracking del link, dejando el permalink base del post. */
function canonicalizePostLink(href: string): string {
  const url = new URL(href, "https://www.facebook.com");
  url.searchParams.delete("comment_id");
  url.searchParams.delete("reply_comment_id");
  url.searchParams.delete("__cft__[0]");
  url.searchParams.delete("__tn__");
  url.searchParams.delete("mibextid");
  url.hash = "";
  return url.href;
}

/**
 * Fuente principal: busca un <a href> real dentro del feed/main que parezca
 * un permalink — es lo que realmente está renderizado arriba de la página,
 * en el mismo orden en que aparece en pantalla, así que el primer match es
 * confiablemente "lo más reciente" (así funcionó siempre para posts de texto
 * y foto). Espera a que el feed tenga AL MENOS un link (no específicamente
 * [role="article"]: las páginas de video/en vivo pueden no usar ese role en
 * absoluto, y exigirlo hacía que esta búsqueda nunca encontrara nada ahí).
 */
async function findPermalinkFromDom(
  page: Page,
  pageUrl: string,
  isMatch: (href: string) => boolean,
): Promise<string | null> {
  const pageSegment = extractPageSegment(pageUrl);

  for (const containerSelector of ['[role="feed"]', '[role="main"]']) {
    const container = page.locator(containerSelector).first();

    const ready = await container
      .locator("a[href]")
      .first()
      .waitFor({ state: "attached", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!ready) continue;

    const hrefs = await container
      .locator("a[href]")
      .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href))
      .catch(() => [] as string[]);

    const match = hrefs.find((href) => isMatch(href) && belongsToPage(href, pageSegment));
    if (match) return match;
  }

  return null;
}

/**
 * Último recurso si no hay ningún <a href> utilizable en el DOM: Facebook
 * también embebe el permalink en el JSON de hidratación del HTML inicial.
 * Riesgoso como fuente PRIMARIA — confirmado con un caso real: ese mismo JSON
 * puede traer el permalink de una publicación de OTRA página (un banner tipo
 * "alguien que seguís está en vivo ahora") o de una publicación VIEJA de la
 * MISMA página (no necesariamente la más reciente) — por eso solo se usa
 * cuando el DOM no dio ningún resultado, y aun así exige que el link
 * pertenezca a la página pedida.
 */
async function findPermalinkFromEmbeddedJson(
  page: Page,
  pageUrl: string,
  isMatch: (href: string) => boolean,
): Promise<string | null> {
  const html = await page.content();
  const pageSegment = extractPageSegment(pageUrl);

  const re = /"permalink_url":"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html))) {
    const href = match[1].replace(/\\\//g, "/");
    if (!belongsToPage(href, pageSegment)) continue;
    if (isMatch(href)) return href;
  }

  return null;
}

/**
 * "Obtener el último post, y de ahí seguir las reglas": primero se agota el
 * camino normal (post de texto/foto/compartido) completo, DOM y luego JSON.
 * Solo si eso no encuentra absolutamente nada se entra, como excepción
 * condicional, al parámetro de video/en vivo — nunca al revés, y nunca mezclados.
 */
async function findLatestPostLink(page: Page, pageUrl: string): Promise<string | null> {
  const normal =
    (await findPermalinkFromDom(page, pageUrl, isNormalPostLink)) ??
    (await findPermalinkFromEmbeddedJson(page, pageUrl, isNormalPostLink));
  if (normal) return normal;

  return (
    (await findPermalinkFromDom(page, pageUrl, isVideoOrLiveLink)) ??
    (await findPermalinkFromEmbeddedJson(page, pageUrl, isVideoOrLiveLink))
  );
}

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

    console.info("[Facebook] Page opened successfully, looking for the latest post's link...");

    // En vez de parsear el feed en el sitio (frágil: comentarios, respuestas y
    // esqueletos de carga también usan role="article", y ya probamos y fallamos con
    // esa estrategia varias veces) hacemos lo mínimo posible acá: encontrar el link
    // al permalink de la primera publicación del timeline, y re-navegar a esa URL.
    // Ahí Facebook muestra el post en un [role="dialog"] aislado — el MISMO patrón
    // que ya usa getFacebookPost()/extractFacebookPost() para un post puntual.
    //
    // Importante: si no aparece ningún link confiable, NO adivinamos con
    // cualquier link de la página entera — eso una vez trajo un link de
    // notificación de OTRA persona. Mejor fallar con diagnóstico.
    const foundHref = await findLatestPostLink(page, requestedUrl);

    if (!foundHref) {
      await dumpDebugPage(page, "no-post-link-found");
      throw new FacebookError(
        "EXTRACTION_FAILED",
        "No se encontró ningún link a una publicación en esta página. Se guardó un volcado en .facebook-debug/ para diagnosticar.",
        422,
      );
    }

    const permalink = canonicalizePostLink(foundHref);

    console.info(`[Facebook] Navegando al permalink de la última publicación: ${permalink}`);
    const postResponse = await page.goto(permalink, { waitUntil: "domcontentloaded" });

    if (postResponse?.status() === 404) {
      throw new FacebookError("POST_NOT_FOUND", "La publicación no existe.", 404);
    }

    if (postResponse && postResponse.status() >= 500) {
      throw new FacebookError("POST_NOT_ACCESSIBLE", "Facebook no pudo mostrar la publicación.", 403);
    }

    const postUnavailable = page
      .locator('[role="dialog"]:visible, [role="main"]')
      .getByText(
        /(?:contenido|página) no (?:está|se encuentra) disponible|content isn't available|page isn't available|link you followed may be broken|sorry, something went wrong|lo sentimos, se produjo un error/i,
      )
      .first();

    if (await postUnavailable.isVisible().catch(() => false)) {
      throw new FacebookError(
        "POST_NOT_ACCESSIBLE",
        "La publicación no está disponible o no tienes permiso para verla.",
        403,
      );
    }

    // A diferencia de getFacebookPost() (URL de post explícita), acá NO rechazamos
    // videos: si la última publicación es un video, igual devolvemos su texto/caption
    // (si tiene) e ignoramos el video en sí.
    const post = await extractFacebookPost(page);

    if (!post.text || post.text.trim().length === 0) {
      // checkLatestFromSource() va a rechazar esto por falta de texto — pero si
      // Facebook SÍ mostraba una descripción visible (confirmado con un caso real:
      // transmisiones en vivo), necesitamos el HTML real para saber por qué
      // extractMessageText no la encontró, en vez de adivinar el selector.
      await dumpDebugPage(page, "no-text-found");
    }

    return { ...post, url: normalizeVideoPermalink(permalink, requestedUrl) };
  });
}
