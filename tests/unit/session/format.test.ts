import { describe, it, expect } from "vitest";
import { tomatoCount } from "@/lib/session/format";

describe("tomatoCount", () => {
  it("returns 0 for durations under 20 minutes", () => {
    expect(tomatoCount(300)).toBe(0);
    expect(tomatoCount(1199)).toBe(0);
  });

  it("returns 1 at exactly 20 minutes", () => {
    expect(tomatoCount(1200)).toBe(1);
  });

  it("floors to whole tomatoes per 20-minute block", () => {
    expect(tomatoCount(2400)).toBe(2);
    expect(tomatoCount(5400)).toBe(4);
  });
});
