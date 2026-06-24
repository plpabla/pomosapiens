// Pins test-plan §2 row #5 (stuck-open SSR redirect cascade).
// Intentionally locks the 50-min abandoned threshold inconsistency (SSR 50 min vs API 2 h)
// until roadmap S-05 (explicit-session-abandon) removes the time-based auto-abandon entirely.
import { describe, it, expect } from "vitest";
import { resolveSessionPageAccess } from "@/lib/session/access";

const FOCUS = 1500; // 25 * 60 -- referenced via formula below so intent is visible

interface RowOverrides {
  id?: string;
  started_at?: string;
  ended_at?: string | null;
  energy_level?: string;
}

function makeRow(overrides: RowOverrides = {}) {
  return {
    id: "session-1",
    started_at: new Date(0).toISOString(),
    ended_at: null,
    energy_level: "medium",
    ...overrides,
  };
}

describe("resolveSessionPageAccess (risk #5: stuck-open SSR guard)", () => {
  it("redirects when row is null (not found or cross-user)", () => {
    const result = resolveSessionPageAccess({ row: null, nowMs: 0, focusPresetSeconds: FOCUS });
    expect(result).toEqual({ kind: "redirect", to: "/dashboard" });
  });

  it("redirects when ended_at is non-null (already-ended replay guard)", () => {
    const row = makeRow({ started_at: new Date(1000).toISOString(), ended_at: "2026-06-23T10:00:00Z" });
    const result = resolveSessionPageAccess({ row, nowMs: 2000, focusPresetSeconds: FOCUS });
    expect(result).toEqual({ kind: "redirect", to: "/dashboard" });
  });

  it("redirects when started_at is older than 2 * focusPresetSeconds (abandoned guard) -- TODO(S-05)", () => {
    // TODO(S-05): boundary will be removed by roadmap S-05 (explicit abandon).
    // This test pins current 50-min behavior as a regression target until S-05 ships.
    const startedAtMs = 0;
    const nowMs = 2 * FOCUS * 1000 + 1; // one millisecond past the boundary
    const row = makeRow({ started_at: new Date(startedAtMs).toISOString() });
    const result = resolveSessionPageAccess({ row, nowMs, focusPresetSeconds: FOCUS });
    expect(result).toEqual({ kind: "redirect", to: "/dashboard" });
  });

  it("allows when started_at is exactly at the abandoned boundary (> not >=)", () => {
    const startedAtMs = 0;
    const nowMs = 2 * FOCUS * 1000; // exactly at the boundary -- > means this is still allowed
    const row = makeRow({ started_at: new Date(startedAtMs).toISOString() });
    const result = resolveSessionPageAccess({ row, nowMs, focusPresetSeconds: FOCUS });
    expect(result).toEqual({ kind: "allow", startedAtMs });
  });

  it("allows valid running session and returns startedAtMs", () => {
    const startedAtMs = Date.now() - 5 * 60 * 1000; // 5 minutes ago
    const row = makeRow({ started_at: new Date(startedAtMs).toISOString(), ended_at: null });
    const result = resolveSessionPageAccess({ row, nowMs: Date.now(), focusPresetSeconds: FOCUS });
    expect(result).toEqual({ kind: "allow", startedAtMs });
  });
});
