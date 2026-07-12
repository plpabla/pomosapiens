import { describe, it, expect, beforeEach } from "vitest";
import { localPersistence } from "@/lib/local/localPersistence";
import { getInProgressSession, LOCAL_SESSIONS_KEY } from "@/lib/local/localSessions";

describe("localPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_SESSIONS_KEY }));
  });

  it("createSession writes a local row and returns its id and startedAtMs", async () => {
    const result = await localPersistence.createSession({
      energy_level: "medium",
      topic_id: null,
      material_format_id: null,
      timer_mode: "preset_1",
      planned_focus_seconds: 25 * 60,
      planned_break_seconds: 5 * 60,
    });

    const stored = getInProgressSession();
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(result.id);
    expect(result.startedAtMs).toBe(Date.parse(stored?.started_at ?? ""));
  });

  it("endSession updates the matching local row's rating, note, and ended_at", async () => {
    const { id } = await localPersistence.createSession({
      energy_level: "low",
      topic_id: null,
      material_format_id: null,
      timer_mode: "count_up",
      planned_focus_seconds: null,
      planned_break_seconds: null,
    });

    const endedAt = new Date().toISOString();
    await localPersistence.endSession(id, { focus_rating: 4, ended_at: endedAt, note: "good one" });

    expect(getInProgressSession()).toBeNull();
  });
});
