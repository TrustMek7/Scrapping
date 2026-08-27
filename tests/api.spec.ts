import { expect, test } from "playwright/test";

test("rechaza entradas que no son publicaciones permitidas", async ({ request }) => {
  const invalidInputs = [
    null,
    "",
    "no-es-una-url",
    "https://example.com/post/1",
    "https://www.facebook.com/share/v/123/",
  ];

  for (const url of invalidInputs) {
    const response = await request.post("/api/facebook/post", { data: { url } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_URL");
  }
});

test("requiere sesión antes de abrir una publicación", async ({ request }) => {
  await request.delete("/api/facebook/session");
  const response = await request.post("/api/facebook/post", {
    data: { url: "https://www.facebook.com/share/p/123/" },
  });

  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("SESSION_REQUIRED");
});

test("una imagen temporal desconocida responde 404", async ({ request }) => {
  const response = await request.get(
    "/api/facebook/images/00000000-0000-0000-0000-000000000000",
  );

  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe("POST_NOT_FOUND");
});
