import { expect, test } from "playwright/test";

import { getFacebookImage, storeFacebookImage } from "@/lib/facebook/image-cache";

test("mantiene imágenes temporalmente por un identificador opaco", () => {
  const url = storeFacebookImage(new Uint8Array([1, 2, 3]), "image/png");
  const image = getFacebookImage(url.split("/").at(-1) ?? "");

  expect(url).toMatch(/^\/api\/facebook\/images\/[0-9a-f-]+$/);
  if (!image) throw new Error("Expected cached image");
  expect(image?.contentType).toBe("image/png");
  expect(Array.from(new Uint8Array(image.body))).toEqual([1, 2, 3]);
});
