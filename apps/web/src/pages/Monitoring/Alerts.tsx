import { useEffect, useState } from "react";
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
import {
  checkAllFacebookSources,
  checkFacebookSource,
  deleteAllPublications,
  fetchAlerts,
  fetchFacebookSession,
  fetchRecentPublications,
  fetchSources,
  loginFacebook,
  logoutFacebook,
  type AlertListItem,
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
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recentPublications, setRecentPublications] = useState<RecentPublicationItem[]>([]);
  const [imagesModalPub, setImagesModalPub] = useState<RecentPublicationItem | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const [facebookSources, setFacebookSources] = useState<SourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [sessionStatus, setSessionStatus] = useState<FacebookSessionStatus | "checking" | "error">(
    "checking",
  );
  const [loginPending, setLoginPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);

  const load = () => {
    setLoading(true);
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
      .then(setRecentPublications)
      .catch(() => undefined);
  };

  useEffect(load, []);
  useEffect(loadRecentPublications, []);

  useEffect(() => {
    loadFacebookSession();
    fetchSources()
      .then((sources) => setFacebookSources(sources.filter((s) => s.type === "FACEBOOK" && s.status === "ACTIVE")))
      .catch(() => undefined);
  }, []);

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

  const handleCheckSource = async () => {
    if (!selectedSourceId) return;
    setChecking(true);
    try {
      const result = await checkFacebookSource(selectedSourceId);
      if (result.deduplicated) {
        toast.success("La última publicación ya se había analizado antes (sin novedades).");
      } else if (result.analysis?.status === "FAILED") {
        toast.error("El análisis de IA falló para esta publicación.");
      } else {
        const parts = [
          `Relevante: ${result.analysis?.relevant ? "sí" : "no"}`,
          `categoría: ${result.analysis?.category ?? "—"}`,
        ];
        toast.success(
          result.alert
            ? `🔴 Nueva alerta generada (${parts.join(", ")}).`
            : `Publicación analizada, sin alerta (${parts.join(", ")}).`,
        );
      }
      load();
      loadRecentPublications();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    try {
      const results = await checkAllFacebookSources();
      const newAlerts = results.filter((r) => r.ok && r.alertCreated).length;
      const noNews = results.filter((r) => r.ok && !r.alertCreated).length;
      const failed = results.filter((r) => !r.ok).length;

      if (results.length === 0) {
        toast.error("No hay fuentes de Facebook activas para revisar.");
      } else {
        toast.success(
          `${results.length} fuente(s) revisada(s): ${newAlerts} alerta(s) nueva(s), ${noNews} sin novedades, ${failed} con error.`,
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

const handleExportRecentPublications = async () => {
  if (recentPublications.length === 0) {
    toast.error("Todavía no hay registros para exportar.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Publicaciones");

  // Definición de columnas
  worksheet.columns = [
    { header: "Fuente", key: "fuente", width: 25 },
    { header: "Contenido", key: "contenido", width: 80 },
    { header: "Link", key: "link", width: 48 },
    { header: "Resultado IA", key: "resultado", width: 70 },
  ];

  // Estilo del encabezado
  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F5597" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF333333" } },
      bottom: { style: "thin", color: { argb: "FF333333" } },
      left: { style: "thin", color: { argb: "FF333333" } },
      right: { style: "thin", color: { argb: "FF333333" } },
    };
  });

  // Filas de datos
  recentPublications.forEach((pub, index) => {
    const iaResult =
      pub.analysis?.status === "FAILED"
        ? `Falló: ${pub.analysis.error ?? "Error desconocido"}`
        : pub.analysis?.relevant
          ? `Relevante · ${pub.analysis.category ?? "Sin categoría"} · ${pub.analysis.severity ?? "Sin severidad"}`
          : "No relevante";

    const iaSummary = pub.analysis?.summary ? ` | ${pub.analysis.summary}` : "";

    const row = worksheet.addRow({
      fuente: pub.source.name,
      contenido: pub.content,
      link: pub.url,
      resultado: `${iaResult}${iaSummary}`,
    });

    const isEven = index % 2 === 0;

    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.font = { color: { argb: "FF1F1F1F" }, size: 10 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFF2F2F2" : "FFFFFFFF" }, // filas alternadas
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9D9D9" } },
        bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
        left: { style: "thin", color: { argb: "FFD9D9D9" } },
        right: { style: "thin", color: { argb: "FFD9D9D9" } },
      };
    });

    // Link como hipervínculo real
    const linkCell = row.getCell("link");
    if (pub.url) {
      linkCell.value = { text: pub.url, hyperlink: pub.url };
      linkCell.font = { color: { argb: "FF2F5597" }, underline: true, size: 10 };
    }

    // Resaltar filas "Relevante"
    const resultadoCell = row.getCell("resultado");
    if (pub.analysis?.relevant) {
      resultadoCell.font = { ...resultadoCell.font, color: { argb: "FF1B7A32" }, bold: true };
    } else if (pub.analysis?.status === "FAILED") {
      resultadoCell.font = { ...resultadoCell.font, color: { argb: "FFC00000" }, bold: true };
    }
  });

  // Congelar la fila de encabezado
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  // Autofiltro
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 4 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `publicaciones-revisadas-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);

  toast.success(`Se descargó ${recentPublications.length} registro(s) en Excel.`);
};
  return (
    <>
      <PageMeta title="Alertas | Alertas Nación" description="Alertas generadas por el monitor de publicaciones" />
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

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-64">
              <Select
                options={facebookSources.map((s) => ({ value: s.id, label: s.name }))}
                placeholder={facebookSources.length === 0 ? "Sin fuentes de Facebook activas" : "Elegí una fuente..."}
                onChange={setSelectedSourceId}
              />
            </div>
            <Button
              size="sm"
              onClick={handleCheckSource}
              disabled={checking || checkingAll || sessionStatus !== "active" || !selectedSourceId}
            >
              {checking ? "Revisando..." : "Revisar última publicación"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCheckAll}
              disabled={checking || checkingAll || sessionStatus !== "active" || facebookSources.length === 0}
            >
              {checkingAll ? "Revisando todas..." : `Revisar todas (${facebookSources.length})`}
            </Button>
          </div>
          {facebookSources.length === 0 && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No hay fuentes de tipo Facebook activas — creá una en{" "}
              <a href="/monitoreo/fuentes" className="text-brand-500 hover:underline">Fuentes</a>.
            </p>
          )}
        </ComponentCard>

        <ComponentCard title="Alertas detectadas">
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
          {!loading && !error && alerts.length > 0 && (
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
                    {alerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell className="px-5 py-4 text-start font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {alert.entity.name}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <Badge size="sm" color="primary">
                            {alert.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-start text-theme-sm">
                          <Badge size="sm" color={SEVERITY_COLOR[alert.severity]}>
                            {alert.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 max-w-md text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          {alert.summary}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          <a href={alert.publication.url} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                            {alert.publication.source.name}
                          </a>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          {new Date(alert.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </ComponentCard>

        <ComponentCard title="Historial de publicaciones revisadas">
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportRecentPublications}
              disabled={recentPublications.length === 0}
            >
              Descargar Excel
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

          {recentPublications.length === 0 ? (
            <p className="mt-4 text-gray-500 dark:text-gray-400">
              Todavía no se revisó ninguna publicación.
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
                    {recentPublications.map((pub) => (
                      <TableRow key={pub.id}>
                        <TableCell className="px-5 py-4 text-start font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {pub.source.name}
                        </TableCell>
                        <TableCell className="px-4 py-3 max-w-md text-gray-500 text-start text-theme-sm dark:text-gray-400">
                          {pub.content.slice(0, 140)}
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
                          ) : pub.analysis?.relevant ? (
                            <Badge size="sm" color="error">
                              Relevante · {pub.analysis.category} · {pub.analysis.severity}
                            </Badge>
                          ) : (
                            <Badge size="sm" color="info">No relevante</Badge>
                          )}
                          {pub.analysis?.summary && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{pub.analysis.summary}</p>
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
