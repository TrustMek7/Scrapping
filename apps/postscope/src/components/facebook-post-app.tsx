"use client";

import { useEffect, useState } from "react";

import { PostResult } from "@/components/post-result";
import type { FacebookPost } from "@/lib/facebook/types";

const SCRAPPING_API_URL = process.env.NEXT_PUBLIC_SCRAPPING_API_URL ?? "http://localhost:3200";

interface SourceItem {
  id: string;
  name: string;
  type: string;
  url: string;
  status: string;
}

interface CaptureResponse {
  deduplicated: boolean;
  analysis: {
    status: "COMPLETED" | "FAILED";
    relevant: boolean | null;
    category: string | null;
    severity: string | null;
    confidence: number | null;
  } | null;
  alert: { id: string } | null;
}

export function FacebookPostApp() {
  const [url, setUrl] = useState("");
  const [post, setPost] = useState<FacebookPost | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [sessionStatus, setSessionStatus] = useState<
    "checking" | "active" | "required" | "expired" | "error"
  >("checking");
  const [loginPending, setLoginPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [activeSource, setActiveSource] = useState<SourceItem | null>(null);

  const [captureStatus, setCaptureStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [captureResult, setCaptureResult] = useState<CaptureResponse | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

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

  useEffect(() => {
    fetch(`${SCRAPPING_API_URL}/sources`)
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar las fuentes.");
        const data = (await response.json()) as SourceItem[];
        const facebookSources = data.filter((s) => s.type === "FACEBOOK" && s.status === "ACTIVE");
        setSources(facebookSources);
      })
      .catch(() => {
        setSourcesError(
          `No se pudieron cargar las fuentes de Alertas (¿está corriendo el backend en ${SCRAPPING_API_URL}?).`,
        );
      });
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

  function resetResultState() {
    setPost(null);
    setStatus("loading");
    setError(null);
    setActiveSource(null);
    setCaptureStatus("idle");
    setCaptureResult(null);
    setCaptureError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetResultState();

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

  async function checkLatestFromSource() {
    const source = sources.find((s) => s.id === selectedSourceId);
    if (!source) return;

    resetResultState();

    try {
      const response = await fetch("/api/facebook/latest-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.url }),
      });
      const data = (await response.json()) as {
        post?: FacebookPost;
        error?: { code?: string; message?: string };
      };

      if (!response.ok || !data.post) {
        if (data.error?.code === "SESSION_REQUIRED") setSessionStatus("required");
        if (data.error?.code === "SESSION_EXPIRED") setSessionStatus("expired");
        throw new Error(data.error?.message ?? "No se pudo obtener la última publicación.");
      }

      setPost(data.post);
      setActiveSource(source);
      setStatus("success");
    } catch (postError) {
      setError(
        postError instanceof Error
          ? postError.message
          : "No se pudo obtener la última publicación.",
      );
      setStatus("error");
    }
  }

  function clearResult() {
    setPost(null);
    setStatus("idle");
    setActiveSource(null);
    setCaptureStatus("idle");
    setCaptureResult(null);
    setCaptureError(null);
  }

  async function sendToAnalysis() {
    if (!post) return;

    if (!post.text || post.text.trim().length === 0) {
      setCaptureStatus("error");
      setCaptureError(
        "Esta publicación no tiene texto (parece ser solo imagen). Todavía no hay OCR configurado, así que no se puede analizar automáticamente.",
      );
      return;
    }

    setCaptureStatus("sending");
    setCaptureError(null);

    try {
      const response = await fetch(`${SCRAPPING_API_URL}/analysis/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceName: activeSource?.name ?? post.author.name ?? "Facebook (autor desconocido)",
          sourceType: activeSource?.type ?? "FACEBOOK",
          sourceUrl: activeSource?.url ?? post.url,
          title: `Publicación de ${post.author.name ?? "autor desconocido"}`,
          content: post.text,
          url: post.url,
        }),
      });

      const data = (await response.json()) as CaptureResponse & { message?: unknown };

      if (!response.ok) {
        throw new Error(
          typeof data.message === "string" ? data.message : "No se pudo enviar a Alertas.",
        );
      }

      setCaptureResult(data);
      setCaptureStatus("sent");
    } catch (sendError) {
      setCaptureError(
        sendError instanceof Error
          ? `${sendError.message} — ¿está corriendo el backend de Alertas en ${SCRAPPING_API_URL}?`
          : "No se pudo enviar a Alertas.",
      );
      setCaptureStatus("error");
    }
  }

  return (
    <main className="shell">
      <header className="masthead">
        <p className="kicker">Herramienta interna / piloto local</p>
        <h1>Captura una publicación, sin recorrer el feed.</h1>
        <p className="intro">
          Elegí una fuente registrada para traer su última publicación, o pegá una URL de un
          post puntual. La aplicación mostrará únicamente el autor, el texto y las imágenes.
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

        <div className="input-row" style={{ marginTop: "1rem" }}>
          <label htmlFor="source-select" style={{ display: "block", marginBottom: "0.4rem" }}>
            Fuente registrada en Alertas
          </label>
        </div>
        <div className="input-row">
          <select
            id="source-select"
            value={selectedSourceId}
            onChange={(event) => setSelectedSourceId(event.target.value)}
            disabled={sessionStatus !== "active" || sources.length === 0}
          >
            <option value="">
              {sources.length === 0 ? "Sin fuentes de Facebook registradas" : "Elegí una fuente..."}
            </option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={checkLatestFromSource}
            disabled={status === "loading" || sessionStatus !== "active" || !selectedSourceId}
          >
            {status === "loading" ? "Revisando..." : "Revisar última publicación"}
          </button>
        </div>
        {sourcesError && <p className="session-error">{sourcesError}</p>}

        <form onSubmit={handleSubmit} style={{ marginTop: "1.25rem" }}>
          <label id="query-title" htmlFor="facebook-url">
            O pegá la URL de un post puntual
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
        {status === "success" && post && (
          <>
            {activeSource && (
              <p className="muted" style={{ marginBottom: "0.75rem" }}>
                Última publicación de la fuente registrada <strong>{activeSource.name}</strong>.
              </p>
            )}
            <PostResult post={post} />

            <div className="state-card" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                onClick={sendToAnalysis}
                disabled={captureStatus === "sending" || captureStatus === "sent"}
              >
                {captureStatus === "sending"
                  ? "Enviando..."
                  : captureStatus === "sent"
                    ? "Enviado ✓"
                    : "Enviar a Alertas"}
              </button>

              {captureStatus === "error" && captureError && (
                <p className="session-error">{captureError}</p>
              )}

              {captureStatus === "sent" && captureResult && (
                <div style={{ marginTop: "0.75rem" }}>
                  {captureResult.deduplicated ? (
                    <p className="muted">Esta publicación ya se había capturado antes (duplicada, no se re-analizó).</p>
                  ) : captureResult.analysis?.status === "FAILED" ? (
                    <p className="session-error">El análisis de IA falló — revisá el backend.</p>
                  ) : (
                    <>
                      <p>
                        <strong>Relevante:</strong> {captureResult.analysis?.relevant ? "Sí" : "No"}
                        {" · "}
                        <strong>Categoría:</strong> {captureResult.analysis?.category ?? "—"}
                        {" · "}
                        <strong>Severidad:</strong> {captureResult.analysis?.severity ?? "—"}
                      </p>
                      <p>
                        {captureResult.alert
                          ? "🔴 Se generó una alerta en el dashboard de Alertas."
                          : "No se generó alerta (no superó los umbrales configurados)."}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
