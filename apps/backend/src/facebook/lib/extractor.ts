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

function cleanText(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

async function extractMessageText(post: Locator) {
  const message = post
    .locator('[data-ad-preview="message"], [data-ad-comet-preview="message"]')
    .first();

  if (!(await message.isVisible().catch(() => false))) {
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
  const candidates = await post.locator("img").evaluateAll((nodes) => {
    const seen = new Set<string>();

    return nodes.flatMap((node) => {
      if (!(node instanceof HTMLImageElement) || node.closest('[role="article"]')) return [];

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

async function extractFromContainer(page: Page, post: Locator, fallbackUrl: string): Promise<FacebookPost> {
  console.info("[Facebook] Extracting author...");
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
  // (posts de video/reel a veces no envuelven el nombre en <a>).
  const looseHeading = cleanText(
    await post
      .locator("h1, h2, h3, strong")
      .filter({ hasText: /\S/ })
      .first()
      .textContent()
      .catch(() => null),
  );
  const author = linkedAuthor ?? titleAuthor ?? looseHeading;

  if (!author) {
    await dumpDebugHtml(post, "no-author");
    throw new FacebookError(
      "EXTRACTION_FAILED",
      "No se pudo identificar el autor de la publicación. Se guardó el HTML en .facebook-debug/ para diagnosticar.",
      422,
    );
  }

  console.info("[Facebook] Extracting text...");
  const text = await extractMessageText(post);
  console.info("[Facebook] Extracting images...");
  const images = await extractImages(page, post);

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
  const post = page.locator('[role="dialog"]:visible').first();

  try {
    await post.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    throw new FacebookError(
      "EXTRACTION_FAILED",
      "No se encontró la publicación en la página.",
      422,
    );
  }

  return extractFromContainer(page, post, page.url());
}

// Contenedores donde Facebook puede renderizar el timeline de una página — probamos
// varios porque la estructura exacta varía (y cambia con el tiempo). El de "role=feed"
// es el más común, pero no el único que se vio en uso real.
const FEED_CONTAINER_SELECTORS = [
  '[role="feed"]',
  'div[data-pagelet^="ProfileTimeline"]',
  'div[data-pagelet^="ProfileAppSection"]',
  'div[data-pagelet="page"]',
];

/**
 * Best-effort: extrae la publicación más reciente visible en el timeline de una
 * página (no un permalink puntual). Es menos predecible que la vista de un post —
 * carga diferida, contenido mezclado, estructura que puede cambiar. Prueba varios
 * selectores de contenedor y, si ninguno aparece, busca cualquier [role="article"]
 * visible en toda la página como último recurso.
 */
export async function extractLatestFeedPost(page: Page): Promise<FacebookPost> {
  let firstPost: Locator | null = null;

  for (const selector of FEED_CONTAINER_SELECTORS) {
    const container = page.locator(selector).first();
    const article = container.locator('[role="article"]').first();

    try {
      await article.waitFor({ state: "visible", timeout: 8_000 });
      firstPost = article;
      break;
    } catch {
      continue;
    }
  }

  if (!firstPost) {
    console.warn(
      "[Facebook] Ningún contenedor de feed conocido funcionó, probando [role=article] suelto en toda la página",
    );
    const anyArticle = page.locator('[role="article"]').first();
    try {
      await anyArticle.waitFor({ state: "visible", timeout: 10_000 });
      firstPost = anyArticle;
    } catch {
      throw new FacebookError(
        "EXTRACTION_FAILED",
        "No se encontró ninguna publicación en esta página.",
        422,
      );
    }
  }

  await firstPost.scrollIntoViewIfNeeded();
  return extractFromContainer(page, firstPost, page.url());
}
