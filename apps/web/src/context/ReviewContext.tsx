import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchFacebookCheckStatus, type FacebookCheckStatus } from "../lib/api";

const ReviewContext = createContext<FacebookCheckStatus | null>(null);
export const useReview = () => useContext(ReviewContext);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<FacebookCheckStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await fetchFacebookCheckStatus();
        if (!disposed) { setStatus(next); setUnavailable(false); }
      } catch {
        if (!disposed) setUnavailable(true);
      } finally {
        if (!disposed) timer = setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  return <ReviewContext.Provider value={status}>
    {children}
    {status?.running && <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-99999 max-w-sm rounded-lg border border-brand-200 bg-white p-4 text-sm shadow-lg dark:bg-gray-900 dark:text-white">
      <div className="flex items-center gap-2 font-medium"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        {unavailable ? "Sin conexión. Intentando recuperar el progreso…" : status.cancellationRequested ? "Deteniendo revisión…" : "Ejecutando revisión"}
      </div>
      <p className="mt-1">{status.sourceName ? `Fuente: ${status.sourceName} · ${status.sourceIndex}/${status.totalSources}` : "Preparando fuentes…"}</p>
    </div>}
  </ReviewContext.Provider>;
}
