import { randomUUID } from "node:crypto";

const IMAGE_TTL_MS = 15 * 60 * 1000;
const MAX_IMAGES = 20;

export interface CachedImage {
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

function backendBaseUrl() {
  const port = process.env.PORT ?? "3200";
  return `http://localhost:${port}`;
}

/** Guarda la imagen en memoria y devuelve la URL absoluta del backend para servirla. */
export function storeFacebookImage(body: Uint8Array, contentType: string) {
  removeExpiredImages();

  // Caché FIFO en memoria: alcanza para un solo usuario local y una operación a la vez.
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
  return `${backendBaseUrl()}/facebook/images/${id}`;
}

export function getFacebookImage(id: string) {
  removeExpiredImages();
  return images.get(id) ?? null;
}
