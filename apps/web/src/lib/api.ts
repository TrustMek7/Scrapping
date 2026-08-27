import type { ContentCategory, Severity } from "@scrapping/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

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

export async function fetchAlerts(): Promise<AlertListItem[]> {
  const response = await fetch(`${API_BASE_URL}/alerts`);
  if (!response.ok) {
    throw new Error(`No se pudieron cargar las alertas (HTTP ${response.status})`);
  }
  return response.json();
}
