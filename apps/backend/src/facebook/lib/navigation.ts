import type { BrowserContext, Page } from "playwright";

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

const DEBUG_DUMPS_ENABLED = process.env.FACEBOOK_DEBUG_DUMPS === "true";

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
    // "/photo/?fbid=...&set=a.{album}" (singular) es el link real de una
    // publicación de solo-foto dentro del feed. OJO: "/photo/" también lo usa
    // el carrusel de "Fotos" de la barra lateral, pero con "set=pb.{id
    // numérico}" (navegación del álbum del perfil) — ese NO es una
    // publicación, es solo el visor de fotos, y da "sin texto" siempre.
    // Confirmado con evidencia real: aceptar "/photo/" sin distinguir el
    // "set" trajo puro contenido del carrusel, ninguna publicación real.
    // Por eso se exige específicamente "set=a." (álbum), no "set=pb." (perfil).
    (/^\/photo\/?$/.test(url.pathname) &&
      url.searchParams.has("fbid") &&
      (url.searchParams.get("set") ?? "").startsWith("a.")) ||
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
    // /^\/reel\/[^/]/ exige un id después de "/reel/" — "/reel/?s=tab" (el
    // link genérico de la pestaña "Reels" de la navegación de Facebook, sin
    // ningún id) matcheaba con /^\/reel\// sola y se colaba como si fuera una
    // publicación puntual — confirmado con evidencia real en un volcado.
    /^\/reel\/[^/]/.test(url.pathname) ||
    (/^\/watch\/?$/.test(url.pathname) && url.searchParams.has("v"))
  );
}

// /share/{code}/, /share/p/{code}/, /share/r/{code}/ (reel compartido),
// /share/v/{code}/ (video compartido) — todos son "publicación compartida",
// con un código opaco sin id de página. Confirmado con evidencia real: una
// página que resharea seguido usa los 4 formatos mezclados, y solo reconocer
// "p" (o ninguno) hacía que el resto quedara invisible para el filtro,
// saltándose publicaciones reales en el medio del feed.
function isShareLinkPath(pathname: string): boolean {
  return /^\/share\/(?:[a-z]+\/)?[a-zA-Z0-9_-]+\/?$/.test(pathname);
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
 * descartar contenido de otra página) — salvo tres casos que son
 * códigos/ids "planos" sin ningún id de página en la URL:
 *   - /share/...: código opaco de "publicación compartida".
 *   - /reel/{id}/: los reels usan un namespace global, nunca llevan el slug
 *     de la página en el path.
 *   - /photo/?fbid=...: el permalink real de una publicación de solo-foto
 *     tampoco lleva el slug de la página.
 * Confirmado con evidencia real en los tres casos (reels y fotos de
 * "Colegio La Salle Juliaca" que el usuario dio, verificados uno por uno
 * contra el volcado real: ninguno tenía "colegiolasallejuliaca" en su URL,
 * se rechazaban siempre). Para estos tres casos confiamos en que ya
 * vinieron escaneados dentro del feed/main de la propia página (o del JSON
 * filtrado a mano).
 */
function belongsToPage(href: string, pageSegment: string | null): boolean {
  if (!pageSegment) return true;

  let pathname: string;
  let url: URL;
  try {
    url = new URL(href, "https://www.facebook.com");
    pathname = url.pathname;
  } catch {
    return false;
  }

  if (isShareLinkPath(pathname)) return true;
  if (/^\/reel\/[^/]/.test(pathname)) return true;
  if (
    /^\/photo\/?$/.test(pathname) &&
    url.searchParams.has("fbid") &&
    (url.searchParams.get("set") ?? "").startsWith("a.")
  ) {
    return true;
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
  url.searchParams.delete("rdid");
  // Facebook alterna estas rutas con y sin slash final. Unificarlas evita que
  // la misma publicación cuente dos veces por una diferencia cosmética.
  if (/^\/photo\/?$/.test(url.pathname)) url.pathname = "/photo/";
  if (/^\/(?:reel|videos)\/[^/]+\/?$/.test(url.pathname) || /\/posts\/[^/]+\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/`;
  }
  url.hash = "";
  return url.href;
}

/** Elige el permalink que representa al post, no una foto secundaria dentro de él. */
function postLinkPriority(href: string): number {
  const url = new URL(href, "https://www.facebook.com");
  if (isShareLinkPath(url.pathname) || /\/posts\//.test(url.pathname)) return 5;
  if (/\/permalink\.php$/.test(url.pathname) || url.searchParams.has("story_fbid")) return 4;
  if (/\/videos\//.test(url.pathname) || /^\/reel\/[^/]/.test(url.pathname)) return 3;
  if (/^\/photo\/?$/.test(url.pathname)) return 2;
  return 1;
}

// Facebook renderiza el feed de forma perezosa: al cargar la página solo
// aparecen los primeros 1-3 posts en el DOM, el resto se agrega recién
// cuando el usuario scrollea. Un salto de distancia grande (sea uno fijo de
// 3000px, o el "saltar hasta el último post conocido" que probamos después)
// deja que Facebook cargue varios posts de golpe en una sola tanda — y ahí
// no hay garantía de que el orden en que esos posts se insertan en el DOM
// coincida con el orden real del feed (visual, de arriba hacia abajo). En
// vez de eso, scrolleamos en pasos CHICOS y seguidos (como un scroll real de
// mouse), dejando que el feed cargue de a poco — así el orden de inserción
// en el DOM tiene más chances de coincidir con el orden visual real.
const MAX_SCROLL_ATTEMPTS = 80;
const SMALL_SCROLL_STEPS = 1;
const SMALL_SCROLL_PX = 300;
const SMALL_SCROLL_WAIT_MS = 600;

/**
 * Fuente principal: junta, en el mismo orden en que aparecen en pantalla,
 * hasta `limit` links de publicación (normal o video/en vivo mezclados —
 * mezclarlos acá es seguro porque respetamos el orden real del DOM, a
 * diferencia del JSON embebido que no tiene orden confiable) dentro del
 * feed/main. Espera a que el feed tenga AL MENOS un link (no específicamente
 * [role="article"]: las páginas de video/en vivo pueden no usar ese role en
 * absoluto, y exigirlo hacía que esta búsqueda nunca encontrara nada ahí).
 */
async function collectLatestPostLinksFromDom(
  page: Page,
  pageUrl: string,
  limit: number,
  seen: Set<string> = new Set(),
  results: string[] = [],
  knownPostUrls: ReadonlySet<string> = new Set(),
  firstPostFromJson: string | null = null,
  shouldCancel: () => boolean = () => false,
): Promise<{ links: string[]; reachedKnownPost: boolean; cancelled: boolean }> {
  const pageSegment = extractPageSegment(pageUrl);
  const allHrefsEverSeen = new Set<string>();
  const seenPostContainers = new Set<string>();
  let reachedKnownPost = false;
  let jsonFallbackHandled = firstPostFromJson === null;

  // Esperamos una sola vez a que cualquiera de los layouts tenga links. Antes
  // se esperaba hasta 15 s por `feed` y, si no existía, otros 15 s por `main`.
  const anyAnchor = page.locator('[role="feed"] a[href], [role="main"] a[href]').first();
  const anchorsDeadline = Date.now() + 15_000;
  let pageHasAnchors = false;
  while (!shouldCancel() && Date.now() < anchorsDeadline) {
    pageHasAnchors = (await anyAnchor.count().catch(() => 0)) > 0;
    if (pageHasAnchors) break;
    await page.waitForTimeout(250);
  }

  if (shouldCancel()) return { links: results, reachedKnownPost, cancelled: true };
  if (!pageHasAnchors) {
    if (firstPostFromJson) results.push(firstPostFromJson);
    return { links: results, reachedKnownPost, cancelled: false };
  }

  for (const containerSelector of ['[role="feed"]', '[role="main"]']) {
    const container = page.locator(containerSelector).first();
    const anchors = container.locator("a[href]");
    if ((await anchors.count().catch(() => 0)) === 0) continue;

    const resultsBeforeThisContainer = results.length;

    for (let attempt = 0; attempt <= MAX_SCROLL_ATTEMPTS; attempt++) {
      if (shouldCancel()) return { links: results, reachedKnownPost, cancelled: true };
      // Ojo: evaluateAll() devuelve los elementos en orden del DOCUMENTO, no
      // necesariamente en orden VISUAL — si Facebook virtualiza el feed
      // reciclando/reposicionando elementos con CSS (transform/translate) en
      // vez de insertarlos en el árbol en el orden real, el orden del
      // documento puede no coincidir con el orden en pantalla. Para no
      // confiar ciegamente en eso, traemos también la posición vertical real
      // de cada anchor (relativa a toda la página, sumando el scroll actual)
      // y ordenamos por ahí antes de decidir cuál es "el siguiente".
      const anchorData = await anchors
        .evaluateAll((els) =>
          els
            .map((el) => {
              const rect = el.getBoundingClientRect();
              // El article inmediato identifica la tarjeta que contiene este
              // enlace. Subir hasta el article exterior puede alcanzar un
              // wrapper que agrupa varias unidades del feed y mezclar posts.
              const article = el.closest('[role="article"]');
              const articleRect = article?.getBoundingClientRect();
              const articleTop = articleRect
                ? Math.round(articleRect.top + window.scrollY)
                : null;
              return {
                href: (el as HTMLAnchorElement).getAttribute("href") ?? "",
                top: rect.top + window.scrollY,
                // Todos los links de una galería/foto/caption dentro del mismo
                // article comparten esta clave y deben producir UN solo post.
                articleKey: articleTop === null ? null : `article:${articleTop}`,
                postTop: articleTop ?? rect.top + window.scrollY,
                // Un elemento oculto (display:none, o un padre colapsado)
                // devuelve un rect de puros ceros — eso lo ordenaría como si
                // estuviera arriba de todo, dando un orden falso. Se
                // descartan acá directamente.
                visible: rect.width > 0 && rect.height > 0,
              };
            })
            .filter((a) => a.visible),
        )
        .catch(
          () =>
            [] as {
              href: string;
              top: number;
              articleKey: string | null;
              postTop: number;
              visible: boolean;
            }[],
        );

      anchorData.sort((a, b) => a.postTop - b.postTop || a.top - b.top);

      for (const { href } of anchorData) if (href) allHrefsEverSeen.add(href);

      let newMatchesThisPass = 0;

      const eligible = anchorData.filter(({ href }) => {
        if (!href || !(isNormalPostLink(href) || isVideoOrLiveLink(href))) return false;
        return belongsToPage(href, pageSegment);
      });
      const hasArticleCandidates = eligible.some(({ articleKey }) => articleKey !== null);
      type AnchorCandidate = (typeof eligible)[number];
      const candidatesByPost = new Map<
        string,
        { preferred: AnchorCandidate; aliases: Set<string> }
      >();

      for (const candidate of eligible) {
        // Cuando existen articles reales, los links sueltos de `main` suelen
        // pertenecer a carruseles laterales, navegación o contenido recomendado.
        if (hasArticleCandidates && !candidate.articleKey) continue;
        const canonical = canonicalizePostLink(candidate.href);
        const key = candidate.articleKey ?? `link:${canonical}`;
        const previous = candidatesByPost.get(key);
        if (!previous) {
          candidatesByPost.set(key, { preferred: candidate, aliases: new Set([canonical]) });
          continue;
        }
        previous.aliases.add(canonical);
        if (postLinkPriority(candidate.href) > postLinkPriority(previous.preferred.href)) {
          previous.preferred = candidate;
        }
      }

      const postCandidates = [...candidatesByPost.entries()].sort(
        ([, a], [, b]) => a.preferred.postTop - b.preferred.postTop,
      );

      // El JSON y el primer article visible pueden ser dos URLs distintas del
      // mismo post. Usamos el JSON solo cuando el article superior NO tiene un
      // permalink reconocible; así completa el hueco sin duplicar el post #1.
      if (!jsonFallbackHandled && firstPostFromJson) {
        jsonFallbackHandled = true;
        const firstVisibleArticle = anchorData.find(({ articleKey }) => articleKey)?.articleKey;
        const firstPostArticle = postCandidates.find(([key]) => key.startsWith("article:"))?.[0];
        if (!firstVisibleArticle || firstVisibleArticle !== firstPostArticle) {
          seen.add(firstPostFromJson);
          results.push(firstPostFromJson);
          newMatchesThisPass += 1;
          console.info(`[Facebook] Primer post completado desde el JSON ordenado: ${firstPostFromJson}`);
        }
      }

      for (const [postKey, { preferred, aliases }] of postCandidates) {
        if (results.length >= limit) break;
        if (seenPostContainers.has(postKey)) continue;

        if ([...aliases].some((alias) => knownPostUrls.has(alias))) {
          seenPostContainers.add(postKey);
          reachedKnownPost = true;
          break;
        }
        if (![...aliases].some((alias) => seen.has(alias))) {
          const canonical = canonicalizePostLink(preferred.href);
          seenPostContainers.add(postKey);
          for (const alias of aliases) seen.add(alias);
          seen.add(canonical);
          results.push(canonical);
          newMatchesThisPass += 1;
        }
      }

      console.info(
        `[Facebook] scroll ${attempt}/${MAX_SCROLL_ATTEMPTS} (${containerSelector}): ${anchorData.length} links en el DOM, ${newMatchesThisPass} publicación(es) nueva(s) — total ${results.length}/${limit}`,
      );

      if (attempt === 0 && results.length === 0) {
        // El primer vistazo (sin scrollear todavía) no reconoció NADA — eso es
        // sospechoso, ahí debería estar el post más reciente. Volcamos los
        // hrefs crudos (ya ordenados por posición real) + la página completa
        // para ver con evidencia real qué se está descartando, en vez de
        // seguir adivinando.
        console.info(
          "[Facebook] hrefs del primer intento (sin match, ordenados por posición):",
          JSON.stringify(anchorData, null, 2),
        );
        await dumpDebugPage(page, "first-attempt-no-match");
      }

      if (reachedKnownPost || results.length >= limit || attempt === MAX_SCROLL_ATTEMPTS) break;

      // Varios pasos chicos y seguidos en vez de un salto grande de una sola
      // vez (ni "saltar al último conocido" ni un empujón grande) — así el
      // feed carga de a poco, en vez de en una tanda grande donde el orden
      // de inserción en el DOM puede no coincidir con el orden visual real.
      for (let step = 0; step < SMALL_SCROLL_STEPS; step++) {
        if (shouldCancel()) return { links: results, reachedKnownPost, cancelled: true };
        await page.mouse.wheel(0, SMALL_SCROLL_PX);
        await page.waitForTimeout(SMALL_SCROLL_WAIT_MS);
      }
    }

    if (reachedKnownPost || results.length > resultsBeforeThisContainer) break;
  }

  // Diagnóstico: TODOS los href vistos durante todo el proceso (matcheen o
  // no), para poder confirmar si un link esperado apareció en algún momento
  // del scroll y por qué no se reconoció. Antes esto se volcaba SIEMPRE
  // (éxito o no) — pantallazo + HTML completo a disco en cada fuente
  // revisada, aunque haya encontrado las `limit` publicaciones sin ningún
  // problema. Puro I/O de diagnóstico que nadie mira cuando todo salió bien;
  // ahora solo se vuelca cuando el resultado final quedó vacío, que es el
  // único caso en que hace falta para investigar.
  if (results.length === 0) {
    console.info(
      `[Facebook] Todos los <a href> vistos durante el scroll (${allHrefsEverSeen.size}):`,
      JSON.stringify([...allHrefsEverSeen], null, 2),
    );
    await dumpDebugPage(page, "scroll-finished");
  }

  return { links: results, reachedKnownPost, cancelled: false };
}

/**
 * El primer post de una página recién cargada a veces NO tiene ningún
 * <a href> real todavía — confirmado con evidencia real (volcado real de
 * "Colegio La Salle Juliaca"): el post visible en pantalla ("Santa Rosa de
 * Lima") no tenía NINGÚN <a href> en todo el documento apuntando a él; su
 * timestamp vivía dentro de un <div hidden> de ayuda interna, no en un link
 * clickeable. Por eso el DOM solo (collectLatestPostLinksFromDom) puede
 * arrancar en blanco para el post #1 específicamente, aunque para el resto
 * (posts #2+, ya cargados de forma perezosa con href real) funcione bien.
 *
 * Pero SÍ existe en el JSON de la consulta GraphQL del feed
 * ("user":{"id":"<pageId>","timeline_list_feed_units":{"edges":[{"node":{...
 * "post_id":"<postId>"...) — a diferencia del "permalink_url" que se usaba
 * antes (buscado sin ningún orden garantizado en todo el documento, y que
 * en la práctica trajo contenido incorrecto las tres veces que se activó),
 * esta estructura ES la lista ORDENADA real que Facebook usa para pintar el
 * timeline: edges[0] es, con evidencia de su propio nombre en el código de
 * Facebook, el primer elemento de esa lista — no un fallback ambiguo.
 */
function findFirstPostFromTimelineJson(html: string): string | null {
  const marker = '"timeline_list_feed_units":{"edges":[{"node":{';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const before = html.slice(Math.max(0, markerIndex - 60), markerIndex);
  const pageIdMatch = before.match(/"id":"(\d+)",$/);
  if (!pageIdMatch) return null;

  const after = html.slice(markerIndex, markerIndex + 3_000);
  const postIdMatch = after.match(/"post_id":"(\d+)"/);
  if (!postIdMatch) return null;

  return `https://www.facebook.com/permalink.php?story_fbid=${postIdMatch[1]}&id=${pageIdMatch[1]}`;
}

/**
 * "Obtener el/los último(s) post(s), y de ahí seguir las reglas": primero se
 * intenta conseguir el post #1 desde el JSON ordenado del feed (ver arriba
 * por qué esta fuente puntual sí es confiable, a diferencia del
 * "permalink_url" genérico que se sacó por completo del código). El resto
 * (o el #1 también, si el JSON no lo tenía) se completa con el DOM, que ya
 * funciona bien para contenido cargado de forma perezosa.
 */
async function collectLatestPostLinks(
  page: Page,
  pageUrl: string,
  limit: number,
  knownPostUrls: ReadonlySet<string> = new Set(),
  shouldCancel: () => boolean = () => false,
): Promise<{ links: string[]; reachedKnownPost: boolean; cancelled: boolean }> {
  const seen = new Set<string>();
  const results: string[] = [];

  const html = await page.content();
  if (shouldCancel()) return { links: [], reachedKnownPost: false, cancelled: true };
  const firstFromJson = findFirstPostFromTimelineJson(html);

  // Ojo: NO pasa por belongsToPage() acá a propósito. Ese chequeo compara
  // contra el slug de la URL configurada (ej. "colegiolasallejuliaca"), pero
  // findFirstPostFromTimelineJson arma el link con el id NUMÉRICO de la
  // página (ej. "100063766611192") — nunca van a coincidir como texto,
  // aunque sean la misma página. Confirmado con evidencia real: por este
  // motivo se estaba descartando en silencio el post correcto. No hace
  // falta ese chequeo igual: el id numérico salió del propio "user.id" que
  // encabeza esta consulta puntual, no de una búsqueda ciega — ya está
  // scopeado a la página correcta por construcción.
  if (firstFromJson) {
    const canonical = canonicalizePostLink(firstFromJson);
    if (knownPostUrls.has(canonical)) {
      console.info(`[Facebook] La publicación más reciente ya fue procesada: ${canonical}`);
      return { links: [], reachedKnownPost: true, cancelled: false };
    }
  }

  return collectLatestPostLinksFromDom(
    page,
    pageUrl,
    limit,
    seen,
    results,
    knownPostUrls,
    firstFromJson ? canonicalizePostLink(firstFromJson) : null,
    shouldCancel,
  );
}

// Cuando se reusa un mismo contexto/página entre varias fuentes (ver
// `getLatestPagePostsInContext`), `openFacebookPage` se llama una vez por
// fuente sobre la MISMA página — sin este guard, cada llamada apilaría un
// nuevo `page.route()` sobre la anterior en vez de reemplazarla.
const guardedPages = new WeakSet<Page>();

async function guardNavigation(page: Page) {
  if (guardedPages.has(page)) return;
  guardedPages.add(page);

  await page.route("**/*", async (route) => {
    const request = route.request();
    const mainNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();

    if (mainNavigation && !isAllowedFacebookUrl(request.url())) {
      console.warn("[Facebook] Blocked navigation outside facebook.com");
      await route.abort("blockedbyclient");
      return;
    }

    // Para descubrir links y leer captions no necesitamos descargar fuentes ni
    // streams de audio/video. Las imágenes se mantienen porque sí se guardan.
    if (request.resourceType() === "font" || request.resourceType() === "media") {
      await route.abort("blockedbyclient");
      return;
    }

    await route.continue();
  });
}

/** Abre la URL de una página/perfil y valida sesión/disponibilidad — compartido por getLatestPagePost(s). */
async function openFacebookPage(context: BrowserContext, requestedUrl: string): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  await guardNavigation(page);

  console.info("[Facebook] Waiting for page...");
  const navigationStartedAt = Date.now();
  const response = await page.goto(requestedUrl, { waitUntil: "domcontentloaded" });
  console.info(`[Facebook][tiempo] abrir perfil: ${Date.now() - navigationStartedAt} ms`);

  if (response?.status() === 404) {
    throw new FacebookError("POST_NOT_FOUND", "La página no existe.", 404);
  }

  if (response && response.status() >= 500) {
    throw new FacebookError("POST_NOT_ACCESSIBLE", "Facebook no pudo mostrar la página.", 403);
  }

  if (!isAllowedFacebookUrl(page.url())) {
    throw new FacebookError("POST_NOT_ACCESSIBLE", "Facebook redirigió fuera de una página permitida.", 403);
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

  return page;
}

/** Navega a un permalink puntual (ya encontrado) y lo extrae. Devuelve null si ese post en particular no está disponible. */
async function extractPostAtPermalink(
  page: Page,
  permalink: string,
  requestedUrl: string,
): Promise<FacebookPost | null> {
  console.info(`[Facebook] Navegando al permalink de la publicación: ${permalink}`);
  const navigationStartedAt = Date.now();
  const postResponse = await page.goto(permalink, { waitUntil: "domcontentloaded" });
  console.info(`[Facebook][tiempo] abrir permalink: ${Date.now() - navigationStartedAt} ms`);

  if (postResponse?.status() === 404) return null;

  if (postResponse && postResponse.status() >= 500) {
    throw new FacebookError("POST_NOT_ACCESSIBLE", "Facebook no pudo mostrar la publicación.", 403);
  }

  const postUnavailable = page
    .locator('[role="dialog"]:visible, [role="main"]')
    .getByText(
      /(?:contenido|página) no (?:está|se encuentra) disponible|content isn't available|page isn't available|link you followed may be broken|sorry, something went wrong|lo sentimos, se produjo un error/i,
    )
    .first();

  if (await postUnavailable.isVisible().catch(() => false)) return null;

  // A diferencia de getFacebookPost() (URL de post explícita), acá NO rechazamos
  // videos: si la publicación es un video, igual devolvemos su texto/caption
  // (si tiene) e ignoramos el video en sí.
  const extractionStartedAt = Date.now();
  const post = await extractFacebookPost(page);
  console.info(`[Facebook][tiempo] extraer publicación: ${Date.now() - extractionStartedAt} ms`);

  if (DEBUG_DUMPS_ENABLED && (!post.text || post.text.trim().length === 0)) {
    // El chequeo de "sin texto" vive en el llamador — pero si Facebook SÍ
    // mostraba una descripción visible (confirmado con un caso real:
    // transmisiones en vivo), necesitamos el HTML real para saber por qué
    // extractMessageText no la encontró, en vez de adivinar el selector.
    await dumpDebugPage(page, "no-text-found");
  }

  return { ...post, url: normalizeVideoPermalink(permalink, requestedUrl) };
}

export async function getFacebookPost(input: unknown) {
  const requestedUrl = normalizeFacebookPostUrl(input);

  if (!(await hasStoredSession())) {
    throw new FacebookError("SESSION_REQUIRED", "Necesitas iniciar sesión en Facebook.", 401);
  }

  console.info("[Facebook] Opening post...");
  return withFacebookContext<FacebookPost>(true, async (context) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await guardNavigation(page);

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
    const page = await openFacebookPage(context, requestedUrl);

    console.info("[Facebook] Page opened successfully, looking for the latest post's link...");
    // Importante: si no aparece ningún link confiable, NO adivinamos con
    // cualquier link de la página entera — eso una vez trajo un link de
    // notificación de OTRA persona. Mejor fallar con diagnóstico.
    const { links } = await collectLatestPostLinks(page, requestedUrl, 1);
    const [foundHref] = links;

    if (!foundHref) {
      await dumpDebugPage(page, "no-post-link-found");
      throw new FacebookError(
        "EXTRACTION_FAILED",
        "No se encontró ningún link a una publicación en esta página. Se guardó un volcado en .facebook-debug/ para diagnosticar.",
        422,
      );
    }

    const post = await extractPostAtPermalink(page, foundHref, requestedUrl);

    if (!post) {
      throw new FacebookError("POST_NOT_FOUND", "La publicación no existe.", 404);
    }

    return post;
  });
}

/** Lo que el llamador decide hacer después de recibir un post recién extraído. */
export interface OnPostResult {
  /** true corta el recorrido de permalinks acá — no se extraen los que faltan. */
  stop: boolean;
}

/**
 * Igual que getLatestPagePost(), pero recorre hasta `limit` publicaciones
 * recientes del timeline en vez de solo la última — para poder revisar de
 * una varias publicaciones nuevas en lugar de tener que hacerlo una por una.
 *
 * A propósito NO junta todo en un array para devolverlo al final: cada post
 * se entrega a `onPost` (que persiste/analiza/alerta) apenas termina de
 * extraerse, ANTES de navegar al siguiente permalink — así, si Facebook se
 * cae a mitad de una fuente (post 7 de 10), lo que ya se extrajo y persistió
 * (posts 1-6) queda guardado igual; con todo junto en un array, un error a
 * mitad de camino tiraba TODO lo ya scrapeado sin haber persistido nada.
 * El llamador (FacebookService) decide relevancia/dedup/alerta — acá solo se
 * entrega cada post, en el mismo orden (más reciente primero) del timeline.
 *
 * Recibe un `BrowserContext` ya abierto (en vez de abrir el suyo propio) para
 * que quien revisa varias fuentes seguidas (`checkAllActiveSources`) pueda
 * reusar UN solo navegador para todas, en vez de relanzar Chromium por cada
 * una — el arranque/cierre del navegador es puro overhead fijo por fuente,
 * no depende del contenido de cada una. `getLatestPagePosts()` (abajo) es el
 * wrapper para cuando se revisa una sola fuente y no hay contexto que reusar.
 */
export async function getLatestPagePostsInContext(
  context: BrowserContext,
  input: unknown,
  limit: number,
  onPost: (post: FacebookPost, index: number) => Promise<OnPostResult>,
  knownPostUrls: ReadonlySet<string> = new Set(),
  shouldCancel: () => boolean = () => false,
): Promise<void> {
  const requestedUrl = normalizeFacebookPageUrl(input);
  const page = await openFacebookPage(context, requestedUrl);

  console.info(`[Facebook] Page opened successfully, looking for up to ${limit} recent posts...`);
  const normalizedKnownUrls = new Set(
    [...knownPostUrls].map((url) => canonicalizePostLink(url)),
  );
  const discoveryStartedAt = Date.now();
  const { links: permalinks, reachedKnownPost, cancelled } = await collectLatestPostLinks(
    page,
    requestedUrl,
    limit,
    normalizedKnownUrls,
    shouldCancel,
  );
  console.info(
    `[Facebook][tiempo] descubrir enlaces: ${Date.now() - discoveryStartedAt} ms (${permalinks.length} nuevo(s))`,
  );

  if (permalinks.length === 0) {
    if (cancelled) return;
    if (reachedKnownPost) return;
    await dumpDebugPage(page, "no-post-link-found");
    throw new FacebookError(
      "EXTRACTION_FAILED",
      "No se encontró ningún link a una publicación en esta página. Se guardó un volcado en .facebook-debug/ para diagnosticar.",
      422,
    );
  }

  console.info(`[Facebook] ★★★ PRIMER POST detectado (posición 0 de ${permalinks.length}): ${permalinks[0]} ★★★`);
  console.info(`[Facebook] Lista completa de permalinks detectados: ${JSON.stringify(permalinks, null, 2)}`);

  for (const [index, permalink] of permalinks.entries()) {
    if (shouldCancel()) return;
    const post = await extractPostAtPermalink(page, permalink, requestedUrl);
    if (!post) continue;
    if (shouldCancel()) return;

    const { stop } = await onPost(post, index);
    if (stop) break;
  }
}

export async function getLatestPagePosts(
  input: unknown,
  limit: number,
  headless: boolean,
  onPost: (post: FacebookPost, index: number) => Promise<OnPostResult>,
  knownPostUrls: ReadonlySet<string> = new Set(),
  shouldCancel: () => boolean = () => false,
): Promise<void> {
  if (!(await hasStoredSession())) {
    throw new FacebookError("SESSION_REQUIRED", "Necesitas iniciar sesión en Facebook.", 401);
  }

  console.info(`[Facebook] Opening page... (headless=${headless})`);
  return withFacebookContext<void>(headless, (context) =>
    getLatestPagePostsInContext(context, input, limit, onPost, knownPostUrls, shouldCancel),
  );
}
