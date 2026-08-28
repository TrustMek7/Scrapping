import * as fs from "node:fs";
import * as path from "node:path";
import type { Locator, Page } from "playwright";

import { FacebookError } from "./errors";
import { storeFacebookImage } from "./image-cache";
import type { FacebookPost } from "./types";

const NBSP = String.fromCharCode(160);

const DEBUG_DIR = path.join(process.cwd(), ".facebook-debug");

/** Guarda el HTML de la publicación que falló, para diagnosticar sin adivinar selectores a ciegas. */
async function dumpDebugHtml(post: Locator, label: string) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const html = await post.evaluate((el) => el.outerHTML);
    const file = path.join(DEBUG_DIR, `${label}-${Date.now()}.html`);
    fs.writeFileSync(file, html, "utf8");
    console.warn(`[Facebook] Volcado de HTML para diagnóstico guardado en: ${file}`);
  } catch (dumpError) {
    console.warn("[Facebook] No se pudo guardar el volcado de HTML de diagnóstico", dumpError);
  }
}

/** Igual que dumpDebugHtml pero para cuando no se encontró NINGÚN post — vuelca la página entera + una captura. */
export async function dumpDebugPage(page: Page, label: string) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const stamp = Date.now();
    const html = await page.content();
    fs.writeFileSync(path.join(DEBUG_DIR, `${label}-${stamp}.html`), html, "utf8");
    await page.screenshot({ path: path.join(DEBUG_DIR, `${label}-${stamp}.png`), fullPage: false });
    console.warn(`[Facebook] Volcado de página completa para diagnóstico guardado con el sufijo: ${label}-${stamp}`);
  } catch (dumpError) {
    console.warn("[Facebook] No se pudo guardar el volcado de página de diagnóstico", dumpError);
  }
}

function cleanText(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

/** Saca el id numérico de un video de su URL, ya sea /videos/{id}/ o ?v={id} (formato /watch/live/). */
function extractVideoId(href: string): string | null {
  try {
    const url = new URL(href, "https://www.facebook.com");
    return url.searchParams.get("v") ?? url.pathname.match(/\/videos\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function extractMessageText(post: Locator, page: Page) {
  const message = post
    .locator('[data-ad-preview="message"], [data-ad-comet-preview="message"]')
    .first();

  if (!(await message.isVisible().catch(() => false))) {
    // Transmisiones en vivo (y algunos videos) no ponen el texto en el bloque de
    // mensaje habitual: el caption vive como texto clickeable dentro del propio
    // link al video — confirmado con evidencia real:
    //   <a role="link" href=".../videos/123/"><span>el texto acá</span></a>
    // Pero [role="main"] (el contenedor en este modo relajado) también puede
    // tener un video SUGERIDO/relacionado con su propio link y su propio
    // "caption" — confirmado con otro caso real: se coló el texto de un video
    // completamente ajeno de otra página. Por eso exigimos que el link
    // encontrado sea del MISMO video al que navegamos, no cualquier /videos/.
    const currentVideoId = extractVideoId(page.url());
    const videoCaptionLinks = post.locator('a[role="link"][href*="/videos/"]');
    const count = await videoCaptionLinks.count().catch(() => 0);

    for (let i = 0; i < count; i++) {
      const link = videoCaptionLinks.nth(i);
      const href = await link.getAttribute("href").catch(() => null);
      if (currentVideoId && extractVideoId(href ?? "") !== currentVideoId) continue;

      const cleaned = cleanText(await link.textContent().catch(() => null));
      if (cleaned && cleaned.length > 5) return cleaned;
    }

    return null;
  }

  const showMore = message.getByText(/^(Ver más|See more)$/i).first();
  if (await showMore.isVisible().catch(() => false)) {
    await showMore.click();
  }

  const raw = await message.evaluate((element) => {
    const blocks = new Set(["DIV", "P", "LI"]);
    const read = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.nodeValue ?? "";
        return value.trim() === "" && /[\r\n]/.test(value) ? "" : value;
      }
      if (!(node instanceof HTMLElement)) return "";
      if (node.tagName === "IMG") return node.getAttribute("alt") ?? "";
      if (node.tagName === "BR") return "\n";

      const text = Array.from(node.childNodes, read).join("");
      return blocks.has(node.tagName) ? `${text}\n` : text;
    };

    return read(element);
  });

  return raw
    .split(NBSP)
    .join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractImages(page: Page, post: Locator) {
  // Ojo: el contenedor "post" puede ser él mismo un [role="article"] (caso feed de
  // página) o un [role="dialog"] que contiene comentarios anidados con
  // [role="article"] (caso post puntual). En ambos casos queremos excluir imágenes
  // de COMENTARIOS anidados, pero no las del post mismo — por eso comparamos contra
  // el propio elemento raíz en vez de asumir que cualquier ancestro role=article
  // es siempre un comentario.
  const candidates = await post.evaluate((rootEl) => {
    const nodes = Array.from(rootEl.querySelectorAll("img"));
    const seen = new Set<string>();

    return nodes.flatMap((node) => {
      const nearestArticle = node.closest('[role="article"]');
      if (!(node instanceof HTMLImageElement) || (nearestArticle && nearestArticle !== rootEl)) {
        return [];
      }

      const { width, height } = node.getBoundingClientRect();
      const sourceUrl = node.currentSrc || node.src;

      try {
        const url = new URL(sourceUrl);
        const facebookCdn =
          url.protocol === "https:" &&
          (url.hostname === "fbcdn.net" || url.hostname.endsWith(".fbcdn.net"));

        if (!facebookCdn || width < 200 || height < 100 || seen.has(sourceUrl)) return [];
      } catch {
        return [];
      }

      seen.add(sourceUrl);
      return [
        {
          sourceUrl,
          alt: node.alt.trim() || null,
          width: Math.round(width),
          height: Math.round(height),
        },
      ];
    });
  });

  const images: FacebookPost["images"] = [];
  for (const candidate of candidates) {
    const response = await page.context().request.get(candidate.sourceUrl, {
      timeout: 15_000,
    });
    const contentType = response.headers()["content-type"]?.split(";")[0];
    const body = response.ok() ? await response.body() : null;

    if (
      body &&
      body.byteLength <= 10 * 1024 * 1024 &&
      contentType &&
      /^image\/(jpeg|png|webp|gif)$/.test(contentType)
    ) {
      images.push({
        url: storeFacebookImage(body, contentType),
        alt: candidate.alt,
        width: candidate.width,
        height: candidate.height,
      });
    }
  }

  if (candidates.length > 0 && images.length === 0) {
    throw new FacebookError(
      "EXTRACTION_FAILED",
      "Se encontró una imagen, pero no se pudo obtener de Facebook.",
      422,
    );
  }

  return images;
}

async function extractFromContainer(
  page: Page,
  post: Locator,
  fallbackUrl: string,
  requireAuthor = true,
  includeImages = true,
): Promise<FacebookPost> {
  console.info("[Facebook] Extracting author...");

  // Estrategia principal: el aria-label del propio contenedor suele traer el nombre
  // directo (ej. "Comentario de Fulano hace 4 horas") — más confiable que buscar
  // en <h1-3>/<strong>, que Facebook ya no usa para el nombre del autor.
  const ariaLabel = await post.getAttribute("aria-label").catch(() => null);
  const ariaAuthor =
    ariaLabel?.match(/^(?:Comentario de|Comment by|Publicaci[oó]n de|Post by)\s+(.+?)(?:\s+hace\s|$)/i)?.[1] ??
    null;

  const linkedAuthor = cleanText(
    await post
      .locator("h3 a, h2 a, strong a")
      .filter({ hasText: /\S/ })
      .first()
      .textContent()
      .catch(() => null),
  );
  const dialogTitle = cleanText(
    await post.locator("h2, h3").first().textContent().catch(() => null),
  );
  const titleAuthor = dialogTitle?.match(/^(?:Publicación de|Post by)\s+(.+)$/i)?.[1] ?? null;
  // Último recurso: cualquier encabezado con texto, aunque no sea un link
  // (posts de video/reel a veces no envuelven el nombre en <a>). Riesgoso en
  // el modo relajado ([role="main"] entero): confirmado con evidencia real
  // que agarró "Video", el título de una sección de videos sugeridos, no un
  // nombre de autor — filtramos esas etiquetas genéricas de la UI.
  const GENERIC_UI_LABELS = new Set([
    "video", "videos", "reels", "fotos", "publicaciones",
    "información", "informacion", "seguidores", "todo", "más", "mas",
  ]);
  const looseHeadingRaw = cleanText(
    await post
      .locator("h1, h2, h3, strong")
      .filter({ hasText: /\S/ })
      .first()
      .textContent()
      .catch(() => null),
  );
  const looseHeading =
    looseHeadingRaw && !GENERIC_UI_LABELS.has(looseHeadingRaw.toLowerCase()) ? looseHeadingRaw : null;
  const author = ariaAuthor ?? linkedAuthor ?? titleAuthor ?? looseHeading;

  if (!author && requireAuthor) {
    await dumpDebugHtml(post, "no-author");
    throw new FacebookError(
      "EXTRACTION_FAILED",
      "No se pudo identificar el autor de la publicación. Se guardó el HTML en .facebook-debug/ para diagnosticar.",
      422,
    );
  }

  console.info("[Facebook] Extracting text...");
  const text = await extractMessageText(post, page);

  // En el modo relajado (videos/en vivo sin diálogo aislado) el contenedor es
  // [role="main"] entero — ahí también viven anuncios y contenido sugerido de
  // Facebook (confirmado con evidencia real: se coló una imagen publicitaria
  // de una plataforma de trading). El objetivo para videos siempre fue "solo
  // texto, sin el contenido visual", así que directamente no buscamos imágenes.
  console.info("[Facebook] Extracting images...");
  const images = includeImages ? await extractImages(page, post) : [];

  // Intenta encontrar el permalink real de la publicación (el link del timestamp);
  // si no aparece, usamos la URL de la página como mejor esfuerzo.
  const permalink = await post
    .locator('a[href*="/posts/"], a[href*="/permalink.php"], a[href*="story_fbid"]')
    .first()
    .getAttribute("href")
    .catch(() => null);

  return {
    url: permalink ? new URL(permalink, "https://www.facebook.com").href : fallbackUrl,
    author: { name: author },
    text: text || null,
    images,
    capturedAt: new Date().toISOString(),
  };
}

export async function extractFacebookPost(page: Page): Promise<FacebookPost> {
  // Los permalinks de Facebook ubican el post objetivo en un diálogo; los comentarios usan role=article.
  const dialog = page.locator('[role="dialog"]:visible').first();

  try {
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    return await extractFromContainer(page, dialog, page.url());
  } catch (error) {
    if (error instanceof FacebookError) throw error;
    // No es un timeout esperable: dejamos que se propague en vez de intentar el fallback.
  }

  // Los videos/reels no siempre se abren en un diálogo — a veces es una página
  // completa de reproductor sin ese role. En ese caso no tratamos de leer el
  // video en sí (no hay OCR/transcripción todavía): buscamos el texto/caption
  // directamente en el contenedor principal y seguimos sin exigir autor, para
  // no fallar del todo cuando lo único que interesa es el texto.
  const main = page.locator('[role="main"]').first();
  try {
    await main.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    throw new FacebookError(
      "EXTRACTION_FAILED",
      "No se encontró la publicación en la página.",
      422,
    );
  }

  return extractFromContainer(page, main, page.url(), false, false);
}
