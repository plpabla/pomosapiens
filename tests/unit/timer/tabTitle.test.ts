import { describe, it, expect } from "vitest";
import { getRunningTabTitle } from "@/lib/timer/tabTitle";

const BASE = {
  phase: "rating" as const,
  internalPhase: "rating" as const,
  mode: "preset" as const,
  remaining: 0,
  elapsed: 0,
  breakRemaining: 0,
};

describe("getRunningTabTitle", () => {
  it("shows the countdown for a running preset session", () => {
    expect(getRunningTabTitle({ ...BASE, phase: "running", mode: "preset", remaining: 65 })).toBe(
      "⏱ 01:05 – PomoSapiens",
    );
  });

  it("shows elapsed time for a running count-up session", () => {
    expect(getRunningTabTitle({ ...BASE, phase: "running", mode: "count_up", elapsed: 65 })).toBe(
      "⏱ 01:05 – PomoSapiens",
    );
  });

  it("shows the break countdown while on break", () => {
    expect(getRunningTabTitle({ ...BASE, internalPhase: "running_break", breakRemaining: 59 })).toBe(
      "🌴 00:59 – PomoSapiens",
    );
  });

  it("returns null otherwise (rating screen)", () => {
    expect(getRunningTabTitle(BASE)).toBeNull();
  });
});
