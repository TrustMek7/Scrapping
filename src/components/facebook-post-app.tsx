"use client";

import { useEffect, useState } from "react";

import { PostResult } from "@/components/post-result";
import type { FacebookPost } from "@/lib/facebook/types";

export function FacebookPostApp() {
  const [url, setUrl] = useState("");
  const [post, setPost] = useState<FacebookPost | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [sessionStatus, setSessionStatus] = useState<
    "checking" | "active" | "required" | "expired" | "error"
  >("checking");
  const [loginPending, setLoginPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/facebook/session", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session check failed");
        const data = (await response.json()) as { status: "active" | "required" | "expired" };
        setSessionStatus(data.status);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name !== "AbortError") {
          setSessionStatus("error");
        }
      });

    return () => controller.abort();
  }, []);

  async function login() {
    setLoginPending(true);
    setError(null);

    try {
      const response = await fetch("/api/facebook/session", { method: "POST" });
      const data = (await response.json()) as {
        status?: "active";
        error?: { message?: string };
      };

      if (!response.ok || data.status !== "active") {
        throw new Error(data.error?.message ?? "No se pudo iniciar sesión.");
      }

      setSessionStatus("active");
    } catch (loginError) {
      setSessionStatus("error");
      setError(loginError instanceof Error ? loginError.message : "No se pudo iniciar sesión.");
    } finally {
      setLoginPending(false);
    }
  }

  async function reset() {
    const response = await fetch("/api/facebook/session", { method: "DELETE" });
    if (response.ok) {
      setPost(null);
      setStatus("idle");
      setSessionStatus("required");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPost(null);
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/facebook/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as {
        post?: FacebookPost;
        error?: { code?: string; message?: string };
      };

      if (!response.ok || !data.post) {
        if (data.error?.code === "SESSION_REQUIRED") setSessionStatus("required");
        if (data.error?.code === "SESSION_EXPIRED") setSessionStatus("expired");
        throw new Error(data.error?.message ?? "No se pudo obtener la publicación.");
      }

      setPost(data.post);
      setStatus("success");
    } catch (postError) {
      setError(
        postError instanceof Error ? postError.message : "No se pudo obtener la publicación.",
      );
      setStatus("error");
    }
  }

  function clearResult() {
    setPost(null);
    setStatus("idle");
  }

  return (
    <main className="shell">
      <header className="masthead">
        <p className="kicker">Herramienta interna / piloto local</p>
        <h1>Captura una publicación, sin recorrer el feed.</h1>
        <p className="intro">
          Pega una URL concreta de Facebook. La aplicación mostrará únicamente
          el autor, el texto y las imágenes de esa publicación.
        </p>
      </header>

      <section className="control-panel" aria-labelledby="query-title">
        <div className="session-row">
          <div>
            <span className={`status-dot session-${sessionStatus}`} aria-hidden="true" />
            <span>Sesión de Facebook</span>
          </div>
          <strong>
            {{
              checking: "Comprobando...",
              active: "Activa",
              required: "No iniciada",
              expired: "Expirada",
              error: "No disponible",
            }[sessionStatus]}
          </strong>
          {sessionStatus === "active" ? (
            <button className="session-button" type="button" onClick={reset}>
              Cerrar sesión local
            </button>
          ) : sessionStatus !== "checking" ? (
            <button
              className="session-button"
              type="button"
              onClick={login}
              disabled={loginPending}
            >
              {loginPending ? "Esperando login..." : "Iniciar sesión"}
            </button>
          ) : null}
        </div>

        {loginPending && (
          <p className="session-help">
            Completa el inicio de sesión manualmente en la ventana de Facebook.
          </p>
        )}
        {(sessionStatus === "required" || sessionStatus === "expired") && (
          <p className="session-help">Necesitas iniciar sesión en Facebook para continuar.</p>
        )}
        {sessionStatus === "error" && error && <p className="session-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <label id="query-title" htmlFor="facebook-url">
            URL de la publicación
          </label>
          <div className="input-row">
            <input
              id="facebook-url"
              name="url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.facebook.com/.../posts/..."
              required
              disabled={sessionStatus !== "active"}
              onInvalid={() => {
                setPost(null);
                setError("Introduce una URL válida para continuar.");
                setStatus("error");
              }}
            />
            <button
              type="submit"
              disabled={status === "loading" || sessionStatus !== "active"}
            >
              {status === "loading" ? "Obteniendo..." : "Obtener publicación"}
            </button>
          </div>
        </form>
      </section>

      <section className="results" aria-live="polite" aria-busy={status === "loading"}>
        <div className="section-title">
          <div>
            <p className="eyebrow">Resultado</p>
            <h2>Información normalizada</h2>
          </div>
          {post && (
            <button className="text-button" type="button" onClick={clearResult}>
              Limpiar
            </button>
          )}
        </div>

        {status === "loading" && (
          <div className="state-card loading-state">Abriendo la publicación…</div>
        )}
        {status === "error" && <div className="state-card error-state">{error}</div>}
        {status === "idle" && (
          <div className="state-card empty-state">
            <span>00</span>
            <p>Aún no hay una publicación para mostrar.</p>
          </div>
        )}
        {status === "success" && post && <PostResult post={post} />}
      </section>
    </main>
  );
}
