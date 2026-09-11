import { useState } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "./ConfirmDialog";
import { shutdownSystem } from "../../lib/api";

export default function ShutdownButton() {
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const shutdown = async () => {
    setConfirm(false);
    setPending(true);
    try {
      await shutdownSystem();
      setMessage("Apagado solicitado. Se cerrarán la revisión, los servidores y PostgreSQL. Puedes cerrar esta pestaña; si el apagado no finaliza, ejecuta detener.bat.");
    } catch {
      setPending(false);
      setMessage("No se pudo confirmar el apagado. Ejecuta detener.bat en la carpeta del proyecto; funciona aunque el backend no responda.");
    }
  };
  return <>
    <button className="rounded-lg border border-red-600 px-3 py-2 text-sm text-red-700 dark:text-red-400" disabled={pending} onClick={() => setConfirm(true)}>Apagar sistema</button>
    <ConfirmDialog isOpen={confirm} title="Apagar sistema" message="Se detendrán las revisiones, el backend, el frontend y PostgreSQL de este proyecto. Los datos se conservan y Docker Desktop permanece abierto." confirmLabel="Apagar" onConfirm={shutdown} onCancel={() => setConfirm(false)} />
    {message && createPortal(<div role="alert" className="fixed inset-0 z-[100001] flex items-center justify-center bg-gray-950/80 p-6"><div className="max-w-md rounded-lg bg-white p-6 text-gray-900"><p>{message}</p>{!pending && <button className="mt-4 underline" onClick={() => setMessage("")}>Cerrar</button>}</div></div>, document.body)}
  </>;
}
