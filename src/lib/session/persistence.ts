import { fetchJson } from "@/lib/api/fetchJson";
import type { Mode, EnergyLevel } from "@/lib/types";

export interface CreateSessionInput {
  energy_level: EnergyLevel;
  topic_id: string | null;
  material_format_id: string | null;
  timer_mode: Mode;
  planned_focus_seconds: number | null;
  planned_break_seconds: number | null;
}

export interface EndSessionArgs {
  focus_rating: number | null;
  ended_at: string;
  note: string | null;
}

export interface SessionPersistence {
  createSession(input: CreateSessionInput): Promise<{ id: string; startedAtMs: number }>;
  endSession(id: string, args: EndSessionArgs): Promise<void>;
  continueSession?(id: string): Promise<void>;
}

export const remotePersistence: SessionPersistence = {
  async createSession(input) {
    // Only the local persistence path consumes startedAtMs; the remote path navigates away.
    const data = await fetchJson<{ id: string; started_at?: string }>("/api/sessions", {
      method: "POST",
      body: input,
      fallbackError: "Failed to start session",
    });
    return { id: data.id, startedAtMs: data.started_at ? Date.parse(data.started_at) : Date.now() };
  },

  async endSession(id, args) {
    await fetchJson(`/api/sessions/${id}`, {
      method: "PATCH",
      body: args,
      fallbackError: "Failed to save session",
    });
  },

  async continueSession(id) {
    await fetchJson(`/api/sessions/${id}/continue`, {
      method: "POST",
      fallbackError: "Failed to continue session",
    });
  },
};
