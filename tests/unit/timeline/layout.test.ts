import { describe, it, expect } from "vitest";
import { axisPercent, blockPosition, pomodoroDots, MIN_BLOCK_WIDTH_PERCENT } from "@/lib/timeline/layout";
import type { HoursRange } from "@/lib/timeline/dateRange";

const hoursRange: HoursRange = { start: 6, end: 23 }; // 6 AM - 11 PM, 1020-minute span

function iso(hour: number, minute = 0): string {
  return new Date(2026, 6, 16, hour, minute, 0, 0).toISOString();
}

describe("axisPercent", () => {
  it("maps minutes-since-midnight to percent within the range", () => {
    expect(axisPercent(6 * 60, hoursRange)).toBe(0);
    expect(axisPercent(23 * 60, hoursRange)).toBe(100);
  });

  it("clamps below the range start and above the range end", () => {
    expect(axisPercent(5 * 60, hoursRange)).toBe(0);
    expect(axisPercent(23 * 60 + 30, hoursRange)).toBe(100);
  });
});

describe("blockPosition", () => {
  it("positions a session using known start/end times", () => {
    const { left, width } = blockPosition(
      { started_at: iso(9, 0), ended_at: iso(9, 30), duration_seconds: 1800 },
      hoursRange,
    );
    expect(left).toBeCloseTo(((9 * 60 - 6 * 60) / 1020) * 100, 5);
    expect(width).toBeCloseTo((30 / 1020) * 100, 5);
  });

  it("enforces a minimum width floor for very short sessions", () => {
    const { width } = blockPosition({ started_at: iso(10, 0), ended_at: iso(10, 1), duration_seconds: 60 }, hoursRange);
    expect(width).toBe(MIN_BLOCK_WIDTH_PERCENT);
  });

  it("derives the end from duration_seconds when ended_at is null (in-progress)", () => {
    const { width } = blockPosition({ started_at: iso(8, 0), ended_at: null, duration_seconds: 1800 }, hoursRange);
    expect(width).toBeCloseTo((30 / 1020) * 100, 5);
  });

  it("clamps the right edge when a session spills past the visible hours", () => {
    const { left, width } = blockPosition(
      { started_at: iso(22, 30), ended_at: iso(23, 45), duration_seconds: 4500 },
      hoursRange,
    );
    expect(left).toBeCloseTo(((22.5 * 60 - 6 * 60) / 1020) * 100, 5);
    expect(width).toBeCloseTo((((23 - 22.5) * 60) / 1020) * 100, 5);
  });
});

describe("pomodoroDots", () => {
  it("returns a single half dot for durations under 20 minutes", () => {
    expect(pomodoroDots(10 * 60)).toEqual({ full: 0, half: true });
  });

  it("returns full dots floored to 20-minute slots for durations of 20 minutes or more", () => {
    expect(pomodoroDots(25 * 60)).toEqual({ full: 1, half: false });
    expect(pomodoroDots(50 * 60)).toEqual({ full: 2, half: false });
    expect(pomodoroDots(90 * 60)).toEqual({ full: 4, half: false });
  });

  it("treats a null duration (in-progress, not yet started) as a half dot", () => {
    expect(pomodoroDots(null)).toEqual({ full: 0, half: true });
  });
});
