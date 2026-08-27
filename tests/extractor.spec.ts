import { expect, test } from "playwright/test";

import { extractFacebookPost } from "@/lib/facebook/extractor";

test("extrae el autor del diálogo y no de los comentarios", async ({ page }) => {
  await page.setContent(`
    <main>
      <div role="dialog">
        <h2>Publicación de Página objetivo</h2>
        <h3><a href="/target">Página objetivo</a> está con otra persona.</h3>
        <div data-ad-preview="message" data-ad-comet-preview="message">
          <div>Primera línea</div>
          <div><img alt="📷" src="emoji.png"> Segunda línea</div>
        </div>
      </div>
      <div role="article" aria-label="Comentario de Autor incorrecto">
        <a href="/commenter">Autor incorrecto</a>
      </div>
    </main>
  `);

  const post = await extractFacebookPost(page);

  expect(post.author.name).toBe("Página objetivo");
  expect(post.text).toBe("Primera línea\n📷 Segunda línea");
  expect(post.images).toEqual([]);
});
