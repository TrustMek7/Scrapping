import type { Locator, Page } from "playwright";

import { FacebookError } from "@/lib/facebook/errors";
import { storeFacebookImage } from "@/lib/facebook/image-cache";
import type { FacebookPost } from "@/lib/facebook/types";

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

  return message.evaluate((element) => {
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

    return read(element)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  });
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

export async function extractFacebookPost(page: Page): Promise<FacebookPost> {
  // Facebook permalinks currently place the target post in a dialog; comments use role=article.
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

  console.info("[Facebook] Extracting author...");
  const linkedAuthor = cleanText(
    await post
      .locator("h3 a")
      .filter({ hasText: /\S/ })
      .first()
      .textContent()
      .catch(() => null),
  );
  const dialogTitle = cleanText(
    await post.locator("h2").first().textContent().catch(() => null),
  );
  const titleAuthor = dialogTitle?.match(/^(?:Publicación de|Post by)\s+(.+)$/i)?.[1] ?? null;
  const author = linkedAuthor ?? titleAuthor;

  if (!author) {
    throw new FacebookError(
      "EXTRACTION_FAILED",
      "No se pudo identificar el autor de la publicación.",
      422,
    );
  }

  console.info("[Facebook] Extracting text...");
  const text = await extractMessageText(post);
  console.info("[Facebook] Extracting images...");
  const images = await extractImages(page, post);

  return {
    url: page.url(),
    author: { name: author },
    text: text || null,
    images,
    capturedAt: new Date().toISOString(),
  };
}
