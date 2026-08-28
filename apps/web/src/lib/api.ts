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

export interface CheckSourceResult {
  deduplicated: boolean;
  analysis: {
    status: "COMPLETED" | "FAILED";
    relevant: boolean | null;
    category: ContentCategory | null;
    severity: Severity | null;
    confidence: number | null;
  } | null;
  alert: { id: string } | null;
}

export const checkFacebookSource = (sourceId: string) =>
  request<CheckSourceResult>(`/facebook/sources/${sourceId}/check`, { method: "POST" });

export interface CheckAllSourcesResultItem {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  error?: string;
  deduplicated?: boolean;
  alertCreated?: boolean;
}

export const checkAllFacebookSources = () =>
  request<CheckAllSourcesResultItem[]>("/facebook/sources/check-all", { method: "POST" });
