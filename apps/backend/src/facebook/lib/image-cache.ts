import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

// Antes vivía en memoria (Map) — se perdía cada vez que el backend se reiniciaba,
// aunque el link ya estuviera guardado en Publication.images. Persistiendo en disco
// sobrevive a reinicios; el TTL sigue existiendo solo para no acumular basura.
const IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGES = 200;

const IMAGE_DIR = path.join(process.cwd(), ".facebook-images");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CachedImage {
  body: ArrayBuffer;
  contentType: string;
}

interface ImageMeta {
  contentType: string;
  expiresAt: number;
}

function binPath(id: string) {
  return path.join(IMAGE_DIR, `${id}.bin`);
}

function metaPath(id: string) {
  return path.join(IMAGE_DIR, `${id}.json`);
}

function removeImage(id: string) {
  fs.rmSync(binPath(id), { force: true });
  fs.rmSync(metaPath(id), { force: true });
}

function removeExpiredImages() {
  if (!fs.existsSync(IMAGE_DIR)) return;
  const now = Date.now();

  for (const file of fs.readdirSync(IMAGE_DIR)) {
    if (!file.endsWith(".json")) continue;
    const id = file.slice(0, -".json".length);

    try {
      const meta: ImageMeta = JSON.parse(fs.readFileSync(metaPath(id), "utf8"));
      if (meta.expiresAt <= now) removeImage(id);
    } catch {
      removeImage(id);
    }
  }
}

function enforceMaxImages() {
  const ids = fs
    .readdirSync(IMAGE_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));

  if (ids.length < MAX_IMAGES) return;

  const byAge = ids
    .map((id) => ({ id, mtime: fs.statSync(metaPath(id)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);

  for (const { id } of byAge.slice(0, byAge.length - MAX_IMAGES + 1)) {
    removeImage(id);
  }
}

function backendBaseUrl() {
  const port = process.env.PORT ?? "3200";
  return `http://localhost:${port}`;
}

/** Guarda la imagen en disco y devuelve la URL absoluta del backend para servirla. */
export function storeFacebookImage(body: Uint8Array, contentType: string) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  removeExpiredImages();
  enforceMaxImages();

  const id = randomUUID();
  fs.writeFileSync(binPath(id), Buffer.from(body));
  fs.writeFileSync(
    metaPath(id),
    JSON.stringify({ contentType, expiresAt: Date.now() + IMAGE_TTL_MS } satisfies ImageMeta),
  );

  return `${backendBaseUrl()}/facebook/images/${id}`;
}

export function getFacebookImage(id: string): CachedImage | null {
  // El id viene de la URL (@Param) — validamos formato UUID antes de tocar el
  // filesystem para no abrir una ruta a path traversal.
  if (!UUID_RE.test(id)) return null;

  removeExpiredImages();
  if (!fs.existsSync(metaPath(id)) || !fs.existsSync(binPath(id))) return null;

  try {
    const meta: ImageMeta = JSON.parse(fs.readFileSync(metaPath(id), "utf8"));
    const buffer = fs.readFileSync(binPath(id));
    return {
      body: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      contentType: meta.contentType,
    };
  } catch {
    return null;
  }
}
