import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import * as path from "node:path";

export interface ReviewState {
  id: string;
  running: boolean;
  phase: "RUNNING" | "COMPLETED" | "CANCELLED" | "INTERRUPTED";
  cancellationRequested: boolean;
  startedAt: string;
  finishedAt: string | null;
  sourceName: string | null;
  sourceIndex: number;
  completedSources: number;
  totalSources: number;
  reviewRunId?: number;
  warnings: string[];
  error: string | null;
}

export function newReviewState(): ReviewState {
  return { id: randomUUID(), running: true, phase: "RUNNING", cancellationRequested: false,
    startedAt: new Date().toISOString(), finishedAt: null, sourceName: null,
    sourceIndex: 0, completedSources: 0, totalSources: 0, warnings: [], error: null };
}

/** Persists independently of PostgreSQL so a DB outage does not erase the result. */
export class ReviewStateStore {
  private readonly file = process.env.REVIEW_STATE_FILE ?? path.resolve(process.cwd(), '.review-state.local');
  read(): ReviewState | null {
    try {
      const state = JSON.parse(readFileSync(this.file, 'utf8')) as ReviewState;
      if (!state.id || !state.startedAt || !Array.isArray(state.warnings)) return null;
      if (state.running) {
        state.running = false;
        state.phase = "INTERRUPTED";
        state.error = "El backend se reinició antes de confirmar el final de la revisión.";
        state.finishedAt = new Date().toISOString();
        state.cancellationRequested = false;
        this.write(state);
      }
      return state;
    } catch { return null; }
  }
  write(state: ReviewState) {
    writeFileSync(`${this.file}.tmp.local`, JSON.stringify(state), 'utf8');
    renameSync(`${this.file}.tmp.local`, this.file);
  }
}
