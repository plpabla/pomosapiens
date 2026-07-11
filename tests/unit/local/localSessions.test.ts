import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import {
  createLocalSession,
  endLocalSession,
  getInProgressSession,
  useLocalSessions,
  LOCAL_SESSIONS_KEY,
} from "@/lib/local/localSessions";

const START_MS = 1_700_000_000_000;

const INPUT = {
  energy_level: "medium",
  topic_id: null,
  material_format_id: null,
  timer_mode: "preset_1",
  planned_focus_seconds: 25 * 60,
  planned_break_seconds: 5 * 60,
} as const;

describe("localSessions", () => {
  beforeEach(() => {
    localStorage.clear();
    // The store is a module-level singleton with a cached snapshot; the
    // storage event is its invalidation path for writes it didn't make.
    window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_SESSIONS_KEY }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START_MS);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("creates a session with a UUID id, ISO started_at, and null end-state fields", () => {
    const row = createLocalSession(INPUT);
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(row.started_at).toBe(new Date(START_MS).toISOString());
    expect(row.ended_at).toBeNull();
    expect(row.focus_rating).toBeNull();
    expect(row.note).toBeNull();
    expect(row.energy_level).toBe("medium");
    // Persisted, not just returned.
    expect(localStorage.getItem(LOCAL_SESSIONS_KEY)).toContain(row.id);
  });

  it("ends a session by id, setting focus_rating, ended_at, and note", () => {
    const row = createLocalSession(INPUT);
    const endedAt = new Date(START_MS + 60_000).toISOString();
    endLocalSession(row.id, { focus_rating: 4, ended_at: endedAt, note: "went well" });
    const inProgress = getInProgressSession();
    expect(inProgress).toBeNull();
    const { result } = renderHook(() => useLocalSessions());
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ id: row.id, focus_rating: 4, ended_at: endedAt, note: "went well" });
  });

  it("caps the collection at the newest 200 sessions by started_at", () => {
    for (let i = 0; i < 201; i++) {
      vi.setSystemTime(START_MS + i * 1000);
      const row = createLocalSession(INPUT);
      endLocalSession(row.id, {
        focus_rating: null,
        ended_at: new Date(START_MS + i * 1000 + 500).toISOString(),
        note: null,
      });
    }
    const { result } = renderHook(() => useLocalSessions());
    expect(result.current).toHaveLength(200);
    // The oldest row (i = 0) was dropped.
    const startTimes = result.current.map((s) => s.started_at);
    expect(startTimes).not.toContain(new Date(START_MS).toISOString());
    expect(startTimes).toContain(new Date(START_MS + 200 * 1000).toISOString());
  });

  it("getInProgressSession returns the newest row with ended_at null, or null when none", () => {
    expect(getInProgressSession()).toBeNull();
    const first = createLocalSession(INPUT);
    vi.setSystemTime(START_MS + 10_000);
    const second = createLocalSession(INPUT);
    expect(getInProgressSession()?.id).toBe(second.id);
    endLocalSession(second.id, { focus_rating: 3, ended_at: new Date(START_MS + 20_000).toISOString(), note: null });
    expect(getInProgressSession()?.id).toBe(first.id);
  });

  it("useLocalSessions re-renders when a session is created", () => {
    const { result } = renderHook(() => useLocalSessions());
    expect(result.current).toHaveLength(0);
    act(() => {
      createLocalSession(INPUT);
    });
    expect(result.current).toHaveLength(1);
  });
});
