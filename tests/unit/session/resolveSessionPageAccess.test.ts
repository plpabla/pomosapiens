import { describe, it, expect } from "vitest";
import { resolveSessionPageAccess } from "@/lib/session/access";

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

describe("resolveSessionPageAccess", () => {
  it("redirects when row is null (not found or cross-user)", () => {
    const result = resolveSessionPageAccess({ row: null });
    expect(result).toEqual({ kind: "redirect", to: "/dashboard" });
  });

  it("redirects when ended_at is non-null (already-ended replay guard)", () => {
    const row = makeRow({ started_at: new Date(1000).toISOString(), ended_at: "2026-06-23T10:00:00Z" });
    const result = resolveSessionPageAccess({ row });
    expect(result).toEqual({ kind: "redirect", to: "/dashboard" });
  });

  it("allows a 4-hour-old non-ended session (S-03: no time-based redirect)", () => {
    const startedAtMs = 0;
    const row = makeRow({ started_at: new Date(startedAtMs).toISOString() });
    const result = resolveSessionPageAccess({ row });
    expect(result).toEqual({ kind: "allow", startedAtMs });
  });

  it("allows a recent non-ended session and returns startedAtMs", () => {
    const startedAtMs = Date.now() - 5 * 60 * 1000; // 5 minutes ago
    const row = makeRow({ started_at: new Date(startedAtMs).toISOString(), ended_at: null });
    const result = resolveSessionPageAccess({ row });
    expect(result).toEqual({ kind: "allow", startedAtMs });
  });
});
