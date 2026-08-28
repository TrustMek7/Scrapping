import { expect, test } from "playwright/test";

const mockPost = {
  url: "https://facebook.com/example/posts/987",
  author: { name: "Biblioteca del Barrio" },
  text: "Este es un contenido de prueba para validar la presentación.",
  images: [
    {
      url: "/mock-post.svg",
      alt: "Estantería ilustrada usada como imagen de prueba",
      width: 1200,
      height: 800,
    },
  ],
  capturedAt: "2026-08-27T15:30:00.000Z",
};

test("muestra y actualiza la publicación mock", async ({ page }) => {
  await page.route("**/api/facebook/session", (route) =>
    route.fulfill({ json: { status: "active" } }),
  );
  await page.route("**/api/facebook/post", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ json: { post: mockPost } });
  });
  await page.goto("/");

  await expect(page.getByText("Activa", { exact: true })).toBeVisible();
  await expect(page.getByText("Aún no hay una publicación para mostrar.")).toBeVisible();

  await page
    .getByRole("textbox", { name: "URL de la publicación" })
    .fill("https://facebook.com/example/posts/987");
  await page.getByRole("button", { name: "Obtener publicación" }).click();
  await expect(page.getByRole("button", { name: "Obteniendo..." })).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Biblioteca del Barrio" }),
  ).toBeVisible();
  await expect(page.getByText(/contenido de prueba/)).toBeVisible();
  await expect(
    page.getByAltText("Estantería ilustrada usada como imagen de prueba"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /posts\/987/ })).toHaveAttribute(
    "href",
    "https://facebook.com/example/posts/987",
  );
});

test("muestra URL inválida sin desbordar en móvil", async ({ page }) => {
  await page.route("**/api/facebook/session", (route) =>
    route.fulfill({ json: { status: "active" } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "URL de la publicación" })
    .fill("no-es-una-url");
  await page.getByRole("button", { name: "Obtener publicación" }).click();

  await expect(page.getByText("Introduce una URL válida para continuar.")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("muestra errores seguros devueltos por la API", async ({ page }) => {
  await page.route("**/api/facebook/session", (route) =>
    route.fulfill({ json: { status: "active" } }),
  );
  await page.route("**/api/facebook/post", (route) =>
    route.fulfill({
      status: 400,
      json: { error: { code: "INVALID_URL", message: "Dominio no permitido." } },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "URL de la publicación" })
    .fill("https://example.com/post/1");
  await page.getByRole("button", { name: "Obtener publicación" }).click();

  await expect(page.getByText("Dominio no permitido.")).toBeVisible();
});

test("marca una sesión expirada devuelta por la API", async ({ page }) => {
  await page.route("**/api/facebook/session", (route) =>
    route.fulfill({ json: { status: "active" } }),
  );
  await page.route("**/api/facebook/post", (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: {
          code: "SESSION_EXPIRED",
          message: "Facebook requiere que vuelvas a iniciar sesión manualmente.",
        },
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "URL de la publicación" })
    .fill("https://www.facebook.com/share/p/expired/");
  await page.getByRole("button", { name: "Obtener publicación" }).click();

  await expect(page.getByText("Expirada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  await expect(
    page.getByText("Facebook requiere que vuelvas a iniciar sesión manualmente."),
  ).toBeVisible();
});

test("solicita sesión cuando no existe un perfil local", async ({ page, request }) => {
  await request.delete("/api/facebook/session");
  await page.goto("/");

  await expect(page.getByText("No iniciada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Obtener publicación" })).toBeDisabled();
});
