import { useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import Select from "../../components/form/Select";
import { Modal } from "../../components/ui/modal";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { useReview } from "../../context/ReviewContext";
import { spanishLabel } from "../../lib/labels";
import HighlightedText from "../../components/common/HighlightedText";
import {
  checkAllFacebookSources,
  checkFacebookSource,
  cancelFacebookCheck,
  deleteAllPublications,
  fetchAlerts,
  fetchAlertsForExport,
  fetchAutoCheckStatus,
  fetchFacebookSession,
  getCachedFacebookSession,
  fetchRecentPublications,
  fetchSources,
  loginFacebook,
  logoutFacebook,
  setAutoCheck,
  type AlertListItem,
  type AutoCheckStatus,
  type CheckAllSourcesResultItem,
  type FacebookSessionStatus,
  type RecentPublicationItem,
  type SourceItem,
} from "../../lib/api";
import type { Severity } from "@scrapping/shared";

const SEVERITY_COLOR: Record<Severity, "error" | "warning" | "info"> = {
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "info",
};

const SESSION_LABEL: Record<FacebookSessionStatus | "checking" | "error", string> = {
  checking: "Comprobando...",
  active: "Activa",
  required: "No iniciada",
  expired: "Expirada",
  error: "No disponible",
};

export default function MonitoringAlerts() {
  const toast = useToast();
  const reviewContext = useReview();
  const review = reviewContext.status;
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportingHistory, setExportingHistory] = useState(false);
  const exportingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recentPublications, setRecentPublications] = useState<RecentPublicationItem[]>([]);
  const [alertSourceFilter, setAlertSourceFilter] = useState("ALL");
  const [historySourceFilter, setHistorySourceFilter] = useState("ALL");
  const [historyReviewFilter, setHistoryReviewFilter] = useState("ALL");
  const [imagesModalPub, setImagesModalPub] = useState<RecentPublicationItem | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const [facebookSources, setFacebookSources] = useState<SourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [sessionStatus, setSessionStatus] = useState<FacebookSessionStatus | "checking" | "error">(
    () => getCachedFacebookSession() ?? "checking",
  );
  const [loginPending, setLoginPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const checkRunning = !!review?.running || reviewContext.pending;
  const [cancelPending, setCancelPending] = useState(false);
  const cancelRequestedRef = useRef(false);
  const [checkingAllResults, setCheckingAllResults] = useState<CheckAllSourcesResultItem[]>([]);
  const [checkingAllInitialPublicationCount, setCheckingAllInitialPublicationCount] = useState(0);
  const [autoCheck, setAutoCheckState] = useState<AutoCheckStatus | null>(null);
  const [autoCheckPending, setAutoCheckPending] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchAlerts()
      .then(setAlerts)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const loadFacebookSession = () => {
    fetchFacebookSession()
      .then((res) => setSessionStatus(res.status))
      .catch(() => setSessionStatus("error"));
  };

  const loadRecentPublications = () => {
    fetchRecentPublications()
      .then((data) => {
        console.log("[fetchRecentPublications] respuesta del backend:", data);
        setRecentPublications(data);
      })
      .catch((err: Error) => toast.error(`No se pudo actualizar el historial: ${err.message}`));
  };

  useEffect(load, []);
  useEffect(loadRecentPublications, []);

  useEffect(() => {
    loadFacebookSession();
    fetchSources()
      .then((sources) => setFacebookSources(sources.filter((s) => s.type === "FACEBOOK" && s.status === "ACTIVE")))
      .catch(() => undefined);
    fetchAutoCheckStatus()
      .then(setAutoCheckState)
      .catch(() => undefined);
  }, []);



  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const results = await Promise.allSettled([fetchAlerts(), fetchRecentPublications()]);
      if (disposed) return;
      if (results[0].status === "fulfilled") setAlerts(results[0].value);
      if (results[1].status === "fulfilled") setRecentPublications(results[1].value);
      if (review?.running || checking || checkingAll) timer = setTimeout(refresh, 2000);
    };
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [review?.running, checking, checkingAll]);

  const alertSourceOptions = useMemo(
    () => [...new Set(alerts.map((alert) => alert.publication.source.name))].sort((a, b) => a.localeCompare(b)),
    [alerts],
  );
  const historySourceOptions = useMemo(
    () => [...new Set(recentPublications.map((publication) => publication.source.name))].sort((a, b) => a.localeCompare(b)),
    [recentPublications],
  );
  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => alertSourceFilter === "ALL" || alert.publication.source.name === alertSourceFilter),
    [alerts, alertSourceFilter],
  );
  const filteredRecentPublications = useMemo(
    () => recentPublications.filter(
      (publication) => publication.analysis?.relevant === true &&
        (historySourceFilter === "ALL" || publication.source.name === historySourceFilter) &&
        (historyReviewFilter === "ALL" || String(publication.reviewRunId ?? "LEGACY") === historyReviewFilter),
    ),
    [recentPublications, historySourceFilter, historyReviewFilter],
  );

  const handleToggleAutoCheck = async () => {
    setAutoCheckPending(true);
    try {
      const next = await setAutoCheck(!autoCheck?.enabled, 60);
      setAutoCheckState(next);
      toast.success(
        next.enabled
          ? `Revisión automática activada, cada ${next.intervalMinutes} minuto(s).`
          : "Revisión automática desactivada.",
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAutoCheckPending(false);
    }
  };

  const handleLogin = async () => {
    setLoginPending(true);
    try {
      const res = await loginFacebook();
      setSessionStatus(res.status);
      toast.success("Sesión de Facebook activa.");
    } catch (err) {
      toast.error((err as Error).message);
      setSessionStatus("error");
    } finally {
      setLoginPending(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await logoutFacebook();
      setSessionStatus(res.status);
      toast.success("Sesión de Facebook cerrada.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCheckSource = async (headless = true) => {
    if (!selectedSourceId) return;
    cancelRequestedRef.current = false;
    setChecking(true);
    reviewContext.beginRequest();
    try {
      const outcomes = await checkFacebookSource(selectedSourceId, headless);
      console.log("[checkFacebookSource] respuesta del backend:", outcomes);
      if (outcomes[0]) {
        console.log("★★★ [checkFacebookSource] PRIMER POST (posición 0):", outcomes[0]);
      }
      const newOnes = outcomes.filter((o) => o.ok && !o.deduplicated);
      const alerts = newOnes.filter((o) => o.alertCreated).length;
      const skipped = outcomes.filter((o) => !o.ok).length;
      outcomes.filter((o) => o.error).forEach((o) => toast.error(o.error!));

      if (cancelRequestedRef.current) {
        toast.success("Revisión detenida.");
      } else if (outcomes.length === 0) {
        toast.error("No se encontró ninguna publicación para revisar.");
      } else if (newOnes.length === 0) {
        toast.success("No hay publicaciones nuevas desde la última revisión.");
      } else {
        toast.success(
          `${newOnes.length} publicación(es) nueva(s): ${alerts} alerta(s)${
            skipped > 0 ? `, ${skipped} sin texto/OCR` : ""
          }.`,
        );
      }
      load();
      loadRecentPublications();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setChecking(false);
      reviewContext.endRequest();
      cancelRequestedRef.current = false;
    }
  };

  const handleCheckAll = async () => {
    cancelRequestedRef.current = false;
    setCheckingAll(true);
    reviewContext.beginRequest();
    setCheckingAllResults([]);
    setCheckingAllInitialPublicationCount(recentPublications.length);

    try {
      const results = await checkAllFacebookSources();
      setCheckingAllResults(results);
      console.log("[checkAllFacebookSources] respuesta del backend:", results);
      const newPublications = results.reduce((sum, r) => sum + (r.newPublications ?? 0), 0);
      const newAlerts = results.reduce((sum, r) => sum + (r.newAlerts ?? 0), 0);
      const failed = results.filter((r) => !r.ok).length;

      if (cancelRequestedRef.current) {
        toast.success("Revisión detenida.");
      } else if (results.length === 0) {
        toast.error("No hay fuentes de Facebook activas para revisar.");
      } else {
        toast.success(
          `${results.length} fuente(s) revisada(s): ${newPublications} publicación(es) nueva(s), ${newAlerts} alerta(s), ${failed} con error.`,
        );
      }
      if (failed > 0) {
        results
          .filter((r) => !r.ok)
          .forEach((r) => toast.error(`${r.sourceName}: ${r.error}`));
      }
      load();
      loadRecentPublications();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCheckingAll(false);
      reviewContext.endRequest();
      cancelRequestedRef.current = false;
      load();
      loadRecentPublications();
    }
  };

  const handleCancelCheck = async () => {
    cancelRequestedRef.current = true;
    setCancelPending(true);
    try {
      const status = await cancelFacebookCheck();
      reviewContext.endRequest();
      toast.success(
        status.cancellationRequested
          ? "Detención solicitada. Se terminará la operación en curso y no se continuará con las siguientes."
          : "No hay una revisión activa.",
      );
    } catch (err) {
      cancelRequestedRef.current = false;
      toast.error((err as Error).message);
    } finally {
      setCancelPending(false);
    }
  };

  const handleDeleteAllPublications = async () => {
    try {
      const { deleted } = await deleteAllPublications();
      toast.success(`${deleted} registro(s) eliminado(s).`);
      setConfirmDeleteAll(false);
      load();
      loadRecentPublications();
    } catch (err) {
      setConfirmDeleteAll(false);
      toast.error((err as Error).message);
    }
  };

  const handleExportAlerts = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      const rows = await fetchAlertsForExport();
      const filteredRows = rows.filter(
        (alert) => alertSourceFilter === "ALL" || alert.publication.source.name === alertSourceFilter,
      );
      if (filteredRows.length === 0) {
        toast.error("Todavía no hay alertas para exportar.");
        return;
      }
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Alertas");
      worksheet.columns = [
        { header: "Fuente", key: "source", width: 30 },
        { header: "Resumen", key: "summary", width: 100 },
        { header: "Enlace", key: "link", width: 55 },
      ];
      filteredRows.forEach((alert, index) => {
        const row = worksheet.addRow({
          source: alert.publication.source.name,
          summary: alert.summary,
          link: { text: alert.publication.url, hyperlink: alert.publication.url },
        });
        row.eachCell((cell) => {
          cell.alignment = { vertical: "top", wrapText: true };
          cell.font = { size: 11 };
          cell.fill = {
            type: "pattern", pattern: "solid",
            fgColor: { argb: index % 2 === 0 ? "FFF2F2F2" : "FFFFFFFF" },
          };
        });
        row.getCell("link").font = { color: { argb: "FF2F5597" }, underline: true };
      });
      const header = worksheet.getRow(1);
      header.height = 24;
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      worksheet.autoFilter = { from: "A1", to: `C${worksheet.rowCount}` };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const now = new Date();
      const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
      try {
        anchor.href = url;
        anchor.download = `alertas-${date}.xlsx`;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast.success(`Descarga iniciada: ${filteredRows.length} alerta(s) en Excel.`);
    } catch (err) {
      toast.error(`No se pudo exportar las alertas: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const handleExportHistory = async () => {
    if (filteredRecentPublications.length === 0 || exportingHistory) return;
    setExportingHistory(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Historial");
      worksheet.columns = [
        { header: "Fuente", key: "source", width: 28 },
        { header: "Contenido", key: "content", width: 90 },
        { header: "Enlace", key: "link", width: 55 },
        { header: "Resultado IA", key: "result", width: 70 },
        { header: "Fecha de registro", key: "createdAt", width: 24 },
        { header: "Revisión", key: "review", width: 20 },
      ];
      filteredRecentPublications.forEach((publication, index) => {
        const analysis = publication.analysis;
        const result = !analysis
          ? "Sin análisis"
          : analysis.status === "FAILED"
            ? `Falló: ${analysis.error ?? "Error desconocido"}`
            : analysis.status === "PENDING"
              ? "Pendiente"
              : analysis.relevant
                ? `Relevante · ${spanishLabel(analysis.category)} · ${spanishLabel(analysis.severity)}${analysis.summary ? ` | ${analysis.summary}` : ""}`
                : "No relevante";
        const row = worksheet.addRow({
          source: publication.source.name,
          content: publication.content,
          link: { text: publication.url, hyperlink: publication.url },
          result,
          createdAt: new Date(publication.createdAt).toLocaleString(),
          review: publication.reviewRunId ? `Revisión #${publication.reviewRunId}` : "Registro anterior",
        });
        row.eachCell((cell) => {
          cell.alignment = { vertical: "top", wrapText: true };
          cell.font = { size: 10 };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: index % 2 === 0 ? "FFF2F2F2" : "FFFFFFFF" },
          };
        });
        row.getCell("link").font = { color: { argb: "FF2F5597" }, underline: true, size: 10 };
      });
      const header = worksheet.getRow(1);
      header.height = 24;
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5597" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      worksheet.autoFilter = { from: "A1", to: `F${worksheet.rowCount}` };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = `historial-publicaciones-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast.success(`Descarga iniciada: ${filteredRecentPublications.length} registro(s) del historial.`);
    } catch (err) {
      toast.error(`No se pudo exportar el historial: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      setExportingHistory(false);
    }
  };
  return (
    <>
      <PageMeta title="Alertas | El mapero" description="Alertas generadas por el monitor de publicaciones" />
      <PageBreadcrumb pageTitle="Alertas" />
      <div className="space-y-6">
        <ComponentCard title="Revisar Facebook">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Sesión de Facebook: <strong>{SESSION_LABEL[sessionStatus]}</strong>
            </span>
            {sessionStatus === "active" ? (
              <Button size="sm" variant="outline" onClick={handleLogout}>
                Cerrar sesión
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleLogin} disabled={loginPending}>
                {loginPending ? "Esperando login..." : "Iniciar sesión"}
              </Button>
            )}
          </div>

          {loginPending && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Se abrió una ventana de Chromium en esta computadora — completá el login ahí manualmente.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 dark:border-white/[0.05]">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Revisión automática:{" "}
              <strong>{autoCheck?.enabled ? `activada (cada ${autoCheck.intervalMinutes} min)` : "apagada"}</strong>
              {autoCheck?.enabled && autoCheck.lastRunAt && (
                <> — última corrida: {new Date(autoCheck.lastRunAt).toLocaleString()}</>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleAutoCheck}
              disabled={autoCheckPending || sessionStatus !== "active"}
            >
              {autoCheckPending ? "..." : autoCheck?.enabled ? "Apagar" : "Prender"}
            </Button>
            {!autoCheck?.enabled && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Revisa todas las fuentes activas cada 60 min. Se apaga sola si reiniciás el backend.
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-64">
              <Select
                options={facebookSources.map((s) => ({ value: s.id, label: s.name }))}
                placeholder={facebookSources.length === 0 ? "Sin fuentes de Facebook activas" : "Elegí una fuente..."}
                onChange={setSelectedSourceId}
              />
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
              Últimas 10 publicaciones
            </span>
            <Button
              size="sm"
              onClick={() => handleCheckSource(true)}
              disabled={reviewContext.unavailable || checkRunning || sessionStatus !== "active" || !selectedSourceId}
            >
              {checking ? "Revisando..." : "Revisar publicaciones nuevas"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCheckSource(false)}
              disabled={reviewContext.unavailable || checkRunning || sessionStatus !== "active" || !selectedSourceId}
            >
              {checking ? "Revisando..." : "Ver en vivo (debug)"}
            </Button>
            <Button
              size="sm"
              className={reviewContext.unavailable ? "!bg-amber-500 !text-white" : checkRunning ? "!bg-red-600 !text-white hover:!bg-red-700" : "!bg-green-700 !text-white hover:!bg-green-800"}
              onClick={checkRunning ? handleCancelCheck : handleCheckAll}
              disabled={reviewContext.unavailable || cancelPending || (!(checkRunning) && (sessionStatus !== "active" || facebookSources.length === 0))}
            >
              {reviewContext.unavailable ? "Verificando estado..." : cancelPending ? "Deteniendo..." : checkRunning ? "Detener revisión" : `Iniciar revisión (${facebookSources.length} fuentes)`}
            </Button>
          </div>
          {checkingAll && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Revisando fuentes... publicaciones nuevas detectadas: {Math.max(0, recentPublications.length - checkingAllInitialPublicationCount)}
            </p>
          )}
          {!checkingAll && checkingAllResults.length > 0 && (
            <div className="mt-3 space-y-1 text-sm">
              {checkingAllResults.map((result) => (
                <p key={result.sourceId} className={result.ok ? "text-gray-500 dark:text-gray-400" : "text-error-500"}>
                  {result.ok
                    ? `${result.sourceName}: ${result.newPublications ?? 0} publicación(es) nueva(s), ${result.newAlerts ?? 0} alerta(s)`
                    : `${result.sourceName}: ${result.error}`}
                  {result.warnings?.map((warning, index) => <span key={index} className="block text-red-700 dark:text-red-400">{warning}</span>)}
                </p>
              ))}
            </div>
          )}
          {facebookSources.length === 0 && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No hay fuentes de tipo Facebook activas — creá una en{" "}
              <a href="/monitoreo/fuentes" className="text-brand-500 hover:underline">Fuentes</a>.
            </p>
          )}
        </ComponentCard>

        <ComponentCard title="Alertas detectadas">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-56">
              <Select
                options={[
                  { value: "ALL", label: "Todas las fuentes" },
                  ...alertSourceOptions.map((source) => ({ value: source, label: source })),
                ]}
                defaultValue="ALL"
                onChange={setAlertSourceFilter}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportAlerts}
              disabled={filteredAlerts.length === 0 || exporting}
            >
              {exporting ? "Exportando..." : "Descargar Excel"}
            </Button>
          </div>
          {loading && <p className="text-gray-500 dark:text-gray-400">Cargando...</p>}
          {error && (
            <p className="text-error-500">
              {error} — ¿está corriendo el backend (<code>pnpm dev:backend</code>)?
            </p>
          )}
          {!loading && !error && alerts.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400">
              Todavía no hay alertas. Se crean automáticamente cuando el análisis de una
              publicación cumple las reglas configuradas en <code>ALERT_CATEGORIES</code> /{" "}
              <code>ALERT_MIN_CONFIDENCE</code>.
            </p>
          )}
          {!loading && !error && alerts.length > 0 && filteredAlerts.length === 0 && (
            <p className="mt-4 text-gray-500 dark:text-gray-400">
              No hay alertas para la fuente seleccionada.
            </p>
          )}
          {!loading && !error && filteredAlerts.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Entidad
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Categoría
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Severidad
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Resumen
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Fuente
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Fecha
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {filteredAlerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell className="px-5 py-4 text-start font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          <strong className="text-red-700 dark:text-red-400">{alert.entity.name}</strong>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <Badge size="sm" color="primary">
                            {spanishLabel(alert.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <Badge size="sm" color={SEVERITY_COLOR[alert.severity]}>
                            {spanishLabel(alert.severity)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 max-w-md text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          <HighlightedText text={alert.summary} terms={[alert.entity.name, ...(alert.entity.aliases ?? []), ...(alert.publication.entities ?? []).flatMap(e => [e.entity.name, ...e.entity.aliases]), ...(alert.analysis?.claims ?? []).map(c => c.text)]} />
                          {alert.analysis?.reason && <p className="mt-2"><span>Motivo según el análisis: </span><strong className="text-red-700 dark:text-red-400">{alert.analysis.reason}</strong></p>}
                          <details className="mt-2"><summary className="cursor-pointer">Ver texto original</summary>
                            <HighlightedText text={alert.publication.content} terms={[alert.entity.name, ...(alert.entity.aliases ?? []), ...(alert.publication.entities ?? []).flatMap(e => [e.entity.name, ...e.entity.aliases]), ...(alert.analysis?.claims ?? []).map(c => c.text)]} />
                          </details>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          <a href={alert.publication.url} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                            {alert.publication.source.name}
                          </a>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          {new Date(alert.createdAt).toLocaleString()}
                          <p>{alert.publication.reviewRunId ? `Revisión #${alert.publication.reviewRunId}` : "Registro anterior"}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </ComponentCard>

        <ComponentCard title="Historial de publicaciones relevantes">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-56">
              <Select options={[
                { value: "ALL", label: "Todas las revisiones" },
                ...[...new Set(recentPublications.map(p => p.reviewRunId).filter((id): id is number => id != null))].sort((a, b) => b - a).map(id => ({ value: String(id), label: `Revisión #${id}` })),
                { value: "LEGACY", label: "Registros anteriores" },
              ]} defaultValue="ALL" onChange={setHistoryReviewFilter} />
            </div>
            <div className="min-w-56">
              <Select
                options={[
                  { value: "ALL", label: "Todas las fuentes" },
                  ...historySourceOptions.map((source) => ({ value: source, label: source })),
                ]}
                defaultValue="ALL"
                onChange={setHistorySourceFilter}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportHistory}
                disabled={filteredRecentPublications.length === 0 || exportingHistory}
              >
                {exportingHistory ? "Exportando..." : "Descargar historial"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="!text-error-500 !border-error-500 hover:!bg-error-50"
                onClick={() => setConfirmDeleteAll(true)}
                disabled={recentPublications.length === 0}
              >
                Borrar todos los registros
              </Button>
            </div>
          </div>

          {recentPublications.length === 0 ? (
            <p className="mt-4 text-gray-500 dark:text-gray-400">
              Todavía no hay publicaciones clasificadas como relevantes.
            </p>
          ) : filteredRecentPublications.length === 0 ? (
            <p className="mt-4 text-gray-500 dark:text-gray-400">
              No hay publicaciones relevantes para los filtros seleccionados.
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Fuente
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Contenido
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Link
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Resultado IA
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                        Fecha
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {filteredRecentPublications.map((pub) => (
                      <TableRow key={pub.id}>
                        <TableCell className="px-5 py-4 text-start font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {pub.source.name}
                          <p className="text-xs">{pub.reviewRunId ? `Revisión #${pub.reviewRunId}` : "Registro anterior"}</p>
                          <div className="mt-1" title="Nueva: incorporada desde el inicio de la última revisión. Ya registrada: existía anteriormente; no indica revisión humana.">
                            <Badge size="sm" color={review?.startedAt && new Date(pub.createdAt) >= new Date(review.startedAt) ? "success" : "info"}>
                              {review?.startedAt && new Date(pub.createdAt) >= new Date(review.startedAt) ? "Nueva" : "Ya registrada"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 max-w-md text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          <HighlightedText text={pub.content.slice(0, 140)} terms={[...(pub.entities ?? []).flatMap(e => [e.entity.name, ...e.entity.aliases]), ...(pub.analysis?.claims ?? []).map(c => c.text)]} />
                          {pub.content.length > 140 ? "…" : ""}
                          {pub.images.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setImagesModalPub(pub)}
                              className="mt-1 block text-xs text-brand-500 hover:underline"
                            >
                              🖼️ Ver {pub.images.length} imagen{pub.images.length > 1 ? "es" : ""}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <a href={pub.url} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                            Ver publicación ↗
                          </a>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          {pub.analysis?.status === "FAILED" ? (
                            <Badge size="sm" color="error">Falló: {pub.analysis.error}</Badge>
                          ) : !pub.analysis ? (
                            <Badge size="sm" color="info">Sin análisis</Badge>
                          ) : pub.analysis.status === "PENDING" ? (
                            <Badge size="sm" color="info">Pendiente</Badge>
                          ) : pub.analysis.relevant === null ? (
                            <Badge size="sm" color="info">Sin resultado</Badge>
                          ) : pub.analysis.relevant ? (
                            <Badge size="sm" color="error">
                              Relevante · {spanishLabel(pub.analysis.category)} · {spanishLabel(pub.analysis.severity)}
                            </Badge>
                          ) : (
                            <Badge size="sm" color="info">No relevante</Badge>
                          )}
                          {pub.analysis?.summary && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400"><HighlightedText text={pub.analysis.summary} terms={(pub.entities ?? []).flatMap(e => [e.entity.name, ...e.entity.aliases])} /></p>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          {new Date(pub.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </ComponentCard>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteAll}
        title="Borrar todos los registros"
        message="¿Borrar todo el historial de publicaciones revisadas? Esto también elimina las alertas generadas a partir de ellas. No se puede deshacer."
        confirmLabel="Borrar todo"
        onConfirm={handleDeleteAllPublications}
        onCancel={() => setConfirmDeleteAll(false)}
      />

      <Modal
        isOpen={imagesModalPub !== null}
        onClose={() => setImagesModalPub(null)}
        className="max-w-2xl p-6"
      >
        <h4 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          Imágenes adjuntas
        </h4>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {imagesModalPub?.source.name}
        </p>
        <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
          {imagesModalPub?.images.map((image, index) => (
            <a key={index} href={image.url} target="_blank" rel="noreferrer">
              <img
                src={image.url}
                alt={image.alt ?? ""}
                className="w-full rounded-lg border border-gray-200 object-cover dark:border-white/[0.05]"
              />
            </a>
          ))}
        </div>
      </Modal>
    </>
  );
}
