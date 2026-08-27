import Image from "next/image";

import type { FacebookPost } from "@/lib/facebook/types";

export function PostResult({ post }: { post: FacebookPost }) {
  return (
    <article className="result-card" aria-labelledby="result-title">
      <div className="result-heading">
        <div>
          <p className="eyebrow">Publicación obtenida</p>
          <h2 id="result-title">{post.author.name ?? "Autor no disponible"}</h2>
        </div>
        <time dateTime={post.capturedAt}>
          {new Intl.DateTimeFormat("es", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(post.capturedAt))}
        </time>
      </div>

      <section className="result-section" aria-labelledby="content-title">
        <h3 id="content-title">Contenido</h3>
        <p className="post-copy">{post.text ?? "Sin texto visible."}</p>
      </section>

      <section className="result-section" aria-labelledby="images-title">
        <h3 id="images-title">Imágenes</h3>
        {post.images.length > 0 ? (
          <div className="image-grid">
            {post.images.map((image) => (
              <figure key={image.url}>
                <Image
                  src={image.url}
                  alt={image.alt ?? "Imagen de la publicación"}
                  width={image.width}
                  height={image.height}
                  sizes="(max-width: 700px) 100vw, 720px"
                />
              </figure>
            ))}
          </div>
        ) : (
          <p className="muted">Esta publicación no contiene imágenes.</p>
        )}
      </section>

      <footer className="source">
        <span>Fuente</span>
        <a href={post.url} target="_blank" rel="noreferrer">
          {post.url}
        </a>
      </footer>
    </article>
  );
}
