import type {
  ContentCategory,
  Severity,
  SourceType,
  SourceStatus,
  CreateSourceInput,
  UpdateSourceInput,
  CreateMonitoredEntityInput,
  UpdateMonitoredEntityInput,
} from "@scrapping/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3200";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} en ${path}: ${body}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export interface AlertListItem {
  id: string;
  category: ContentCategory;
  severity: Severity;
  confidence: number;
  summary: string;
  createdAt: string;
  publication: {
    id: string;
    title: string;
    url: string;
    publishedAt: string | null;
    source: { name: string };
  };
  entity: { id: string; name: string };
  notifications: { id: string; channel: string; status: string; sentAt: string | null }[];
}

export const fetchAlerts = () => request<AlertListItem[]>("/alerts");

export interface SourceItem {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  status: SourceStatus;
  lastRunAt: string | null;
  lastPublicationAt: string | null;
  lastError: string | null;
  publicationsCount: number;
  createdAt: string;
}

export const fetchSources = () => request<SourceItem[]>("/sources");
export const createSource = (data: CreateSourceInput) =>
  request<SourceItem>("/sources", { method: "POST", body: JSON.stringify(data) });
export const updateSource = (id: string, data: UpdateSourceInput) =>
  request<SourceItem>(`/sources/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteSource = (id: string) =>
  request<{ deleted: boolean }>(`/sources/${id}`, { method: "DELETE" });

export interface BulkFacebookSourceImportResult {
  created: number;
  skipped: number;
  errors: string[];
  message: string;
}

export const importFacebookSourcesFromExcel = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/sources/import/excel`, {
    method: "POST",
    body: formData,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload?.message ?? "Error al importar fuentes.";
    throw new Error(message);
  }

  return payload as BulkFacebookSourceImportResult;
};

export interface MonitoredEntityItem {
  id: string;
  name: string;
  aliases: string[];
  createdAt: string;
}

export const fetchEntities = () => request<MonitoredEntityItem[]>("/entities");
export const createEntity = (data: CreateMonitoredEntityInput) =>
  request<MonitoredEntityItem>("/entities", { method: "POST", body: JSON.stringify(data) });
export const updateEntity = (id: string, data: UpdateMonitoredEntityInput) =>
  request<MonitoredEntityItem>(`/entities/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteEntity = (id: string) =>
  request<{ deleted: boolean }>(`/entities/${id}`, { method: "DELETE" });

export type FacebookSessionStatus = "active" | "required" | "expired";

export const fetchFacebookSession = () =>
  request<{ status: FacebookSessionStatus }>("/facebook/session");
export const loginFacebook = () =>
  request<{ status: FacebookSessionStatus }>("/facebook/session", { method: "POST" });
export const logoutFacebook = () =>
  request<{ status: FacebookSessionStatus }>("/facebook/session", { method: "DELETE" });

export interface AutoCheckStatus {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
}

export const fetchAutoCheckStatus = () => request<AutoCheckStatus>("/facebook/auto-check");
export const setAutoCheck = (enabled: boolean, intervalMinutes?: number) =>
  request<AutoCheckStatus>("/facebook/auto-check", {
    method: "POST",
    body: JSON.stringify({ enabled, intervalMinutes }),
  });

/** Revisar una fuente ahora trae hasta N publicaciones nuevas (no solo la última), una entrada por post. */
export interface CheckSourcePostOutcome {
  url: string;
  ok: boolean;
  error?: string;
  deduplicated?: boolean;
  relevant?: boolean | null;
  category?: ContentCategory | null;
  alertCreated?: boolean;
}

export const checkFacebookSource = (sourceId: string, limit?: number, headless = true) => {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (!headless) params.set("headless", "false");
  const qs = params.toString();
  return request<CheckSourcePostOutcome[]>(
    `/facebook/sources/${sourceId}/check${qs ? `?${qs}` : ""}`,
    { method: "POST" },
  );
};

export interface CheckAllSourcesResultItem {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  error?: string;
  newPublications?: number;
  newAlerts?: number;
}

export const checkAllFacebookSources = (limit?: number) =>
  request<CheckAllSourcesResultItem[]>(
    `/facebook/sources/check-all${limit ? `?limit=${limit}` : ""}`,
    { method: "POST" },
  );

/** Temporal: para verificar el pipeline de análisis aunque no genere alerta. */
export interface RecentPublicationItem {
  id: string;
  title: string;
  content: string;
  url: string;
  createdAt: string;
  source: { name: string };
  images: { url: string; alt: string | null; width: number; height: number }[];
  analysis: {
    status: "PENDING" | "COMPLETED" | "FAILED";
    relevant: boolean | null;
    category: ContentCategory | null;
    severity: Severity | null;
    confidence: number | null;
    summary: string | null;
    error: string | null;
  } | null;
}

export const fetchRecentPublications = () =>
  request<RecentPublicationItem[]>("/analysis?limit=20");

export const deleteAllPublications = () =>
  request<{ deleted: number }>("/analysis", { method: "DELETE" });
