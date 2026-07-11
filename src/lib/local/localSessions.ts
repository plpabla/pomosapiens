import { useSyncExternalStore } from "react";
import type { EnergyLevel, Mode } from "@/lib/types";
import { createCollectionStore } from "@/lib/local/collectionStore";

// Anon mirror of the `sessions` table. No stored duration_seconds -- the DB
// column is GENERATED, so the local equivalent is computed in selectors from
// started_at/ended_at.
export interface LocalSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_level: EnergyLevel;
  focus_rating: number | null;
  note: string | null;
  topic_id: string | null;
  material_format_id: string | null;
  timer_mode: Mode;
  planned_focus_seconds: number | null;
  planned_break_seconds: number | null;
}

export type CreateLocalSessionInput = Pick<
  LocalSession,
  "energy_level" | "topic_id" | "material_format_id" | "timer_mode" | "planned_focus_seconds" | "planned_break_seconds"
>;

export const LOCAL_SESSIONS_KEY = "pomosapiens.local.sessions";

const MAX_SESSIONS = 200;

const store = createCollectionStore<LocalSession>({ key: LOCAL_SESSIONS_KEY, version: 1 });

export function createLocalSession(input: CreateLocalSessionInput): LocalSession {
  const row: LocalSession = {
    ...input,
    id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    ended_at: null,
    focus_rating: null,
    note: null,
  };
  const next = [...store.getItems(), row].sort((a, b) => a.started_at.localeCompare(b.started_at)).slice(-MAX_SESSIONS);
  store.setItems(next);
  return row;
}

export function endLocalSession(
  id: string,
  args: { focus_rating: number | null; ended_at: string; note: string | null },
): void {
  store.setItems(store.getItems().map((s) => (s.id === id ? { ...s, ...args } : s)));
}

export function getInProgressSession(): LocalSession | null {
  const open = store.getItems().filter((s) => s.ended_at === null);
  if (open.length === 0) return null;
  return open.reduce((newest, s) => (s.started_at > newest.started_at ? s : newest));
}

export function useLocalSessions(): readonly LocalSession[] {
  return useSyncExternalStore(store.subscribe, store.getItems, store.getServerSnapshot);
}
