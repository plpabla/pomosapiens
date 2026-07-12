import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { remotePersistence } from "@/lib/session/persistence";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remotePersistence.createSession", () => {
  it("POSTs the input to /api/sessions and resolves id/startedAtMs from the parsed started_at", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "s1", started_at: "2026-01-01T00:00:00.000Z" }), { status: 201 }),
    );

    const result = await remotePersistence.createSession({
      energy_level: "medium",
      topic_id: null,
      material_format_id: null,
      timer_mode: "preset_1",
      planned_focus_seconds: 1500,
      planned_break_seconds: 300,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          energy_level: "medium",
          topic_id: null,
          material_format_id: null,
          timer_mode: "preset_1",
          planned_focus_seconds: 1500,
          planned_break_seconds: 300,
        }),
      }),
    );
    expect(result).toEqual({ id: "s1", startedAtMs: Date.parse("2026-01-01T00:00:00.000Z") });
  });

  it("falls back to Date.now() when the response has no started_at", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "s2" }), { status: 201 }));
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const result = await remotePersistence.createSession({
      energy_level: "low",
      topic_id: null,
      material_format_id: null,
      timer_mode: "count_up",
      planned_focus_seconds: null,
      planned_break_seconds: null,
    });

    expect(result).toEqual({ id: "s2", startedAtMs: now });
  });
});

describe("remotePersistence.endSession", () => {
  it("PATCHes focus_rating/ended_at/note to /api/sessions/{id}", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await remotePersistence.endSession("s1", {
      focus_rating: 3,
      ended_at: "2026-01-01T00:10:00.000Z",
      note: "good focus",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/s1",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          focus_rating: 3,
          ended_at: "2026-01-01T00:10:00.000Z",
          note: "good focus",
        }),
      }),
    );
  });

  it("throws with the server error message when the PATCH fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Session already ended or not found" }), { status: 409 }),
    );

    await expect(
      remotePersistence.endSession("s1", { focus_rating: null, ended_at: "2026-01-01T00:10:00.000Z", note: null }),
    ).rejects.toThrow("Session already ended or not found");
  });
});
