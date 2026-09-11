import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fetchFacebookCheckStatus, type FacebookCheckStatus } from "../lib/api";

interface ReviewContextValue {
  status: FacebookCheckStatus | null;
  unavailable: boolean;
  pending: boolean;
  beginRequest: () => void;
  endRequest: () => void;
}
const ReviewContext = createContext<ReviewContextValue | null>(null);
export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) throw new Error("Falta ReviewProvider");
  return context;
}

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<FacebookCheckStatus | null>(null);
  const [unavailable, setUnavailable] = useState(true);
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const requestBaseId = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const next = await fetchFacebookCheckStatus(controller.signal);
        if (!disposed) {
          setStatus(next); setUnavailable(false);
          if (next.running || next.id !== requestBaseId.current) setPending(false);
        }
      } catch {
        if (!disposed) setUnavailable(true);
      } finally {
        clearTimeout(timeout);
        if (!disposed) timer = setTimeout(() => setRefresh(n => n + 1), 1000);
      }
    };
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [refresh]);

  const active = pending || status?.running;
  const terminal = status?.phase && !["RUNNING", "IDLE"].includes(status.phase);
  const show = unavailable || active || (terminal && dismissed !== status?.id);
  const label = unavailable ? "No se puede verificar el estado. Reconectando…"
    : status?.cancellationRequested ? "Deteniendo revisión…"
    : active ? "Ejecutando revisión"
    : status?.phase === "INTERRUPTED" ? "Revisión interrumpida"
    : status?.phase === "CANCELLED" ? "Revisión detenida" : "Revisión completada";
  return <ReviewContext.Provider value={{ status, unavailable, pending,
    beginRequest: () => { requestBaseId.current = status?.id ?? null; setPending(true); setDismissed(null); },
    endRequest: () => { setPending(false); setUnavailable(true); setRefresh(n => n + 1); },
  }}>
    {children}
    {show && createPortal(<div role="status" aria-live="polite" className={`fixed bottom-4 right-4 z-[100000] max-w-sm rounded-lg border bg-white p-4 text-sm shadow-lg dark:bg-gray-900 dark:text-white ${unavailable ? "border-amber-500" : "border-brand-200"}`}>
      <div className="flex items-center gap-2 font-medium">
        {(active || unavailable) && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />}
        {label}
      </div>
      {status?.sourceName && <p className="mt-1">Fuente: {status.sourceName} · {status.sourceIndex}/{status.totalSources}</p>}
      {status?.reviewRunId && <p>Revisión #{status.reviewRunId}</p>}
      {terminal && <p>{status?.completedSources ?? 0}/{status?.totalSources ?? 0} fuentes completadas.</p>}
      {status?.error && <p className="mt-2 text-red-700 dark:text-red-400">{status.error}</p>}
      {!!status?.warnings?.length && <p className="mt-2 text-red-700 dark:text-red-400">{status.warnings[status.warnings.length - 1]}</p>}
      {!active && !unavailable && terminal && <button className="mt-2 underline" onClick={() => setDismissed(status?.id ?? null)}>Cerrar aviso</button>}
    </div>, document.body)}
  </ReviewContext.Provider>;
}
