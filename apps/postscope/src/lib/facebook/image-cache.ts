import { randomUUID } from "node:crypto";

const IMAGE_TTL_MS = 15 * 60 * 1000;
const MAX_IMAGES = 20;

interface CachedImage {
  body: ArrayBuffer;
  contentType: string;
  expiresAt: number;
}

const images = new Map<string, CachedImage>();

function removeExpiredImages() {
  const now = Date.now();
  for (const [id, image] of images) {
    if (image.expiresAt <= now) images.delete(id);
  }
}

export function storeFacebookImage(body: Uint8Array, contentType: string) {
  removeExpiredImages();

  // ponytail: an in-memory FIFO cache is enough for one local user and one post at a time.
  if (images.size >= MAX_IMAGES) {
    const oldestId = images.keys().next().value;
    if (oldestId) images.delete(oldestId);
  }

  const id = randomUUID();
  images.set(id, {
    body: Uint8Array.from(body).buffer,
    contentType,
    expiresAt: Date.now() + IMAGE_TTL_MS,
  });
  return `/api/facebook/images/${id}`;
}

export function getFacebookImage(id: string) {
  removeExpiredImages();
  return images.get(id) ?? null;
}
