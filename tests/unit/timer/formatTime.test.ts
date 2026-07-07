import { describe, it, expect } from "vitest";
import { formatTime } from "@/lib/timer/formatTime";

describe("formatTime", () => {
  it("zero-pads minutes and seconds", () => {
    expect(formatTime(65)).toBe("01:05");
  });

  it("clamps negative input to 0", () => {
    expect(formatTime(-5)).toBe("00:00");
  });

  it("formats zero as 00:00", () => {
    expect(formatTime(0)).toBe("00:00");
  });
});
