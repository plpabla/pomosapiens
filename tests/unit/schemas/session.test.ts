import { describe, it, expect } from "vitest";
import { createSessionSchema, endSessionSchema } from "@/lib/schemas/session";

describe("createSessionSchema", () => {
  it("rejects when timer_mode is missing", () => {
    const result = createSessionSchema.safeParse({ energy_level: "low" });
    expect(result.success).toBe(false);
  });

  it("accepts a preset mode with non-null planned durations", () => {
    const result = createSessionSchema.safeParse({
      energy_level: "medium",
      timer_mode: "preset_1",
      planned_focus_seconds: 1500,
      planned_break_seconds: 300,
    });
    expect(result.success).toBe(true);
  });

  it("accepts count_up mode with null planned durations", () => {
    const result = createSessionSchema.safeParse({
      energy_level: "medium",
      timer_mode: "count_up",
      planned_focus_seconds: null,
      planned_break_seconds: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid timer_mode value", () => {
    const result = createSessionSchema.safeParse({
      energy_level: "medium",
      timer_mode: "preset_4",
      planned_focus_seconds: 1500,
      planned_break_seconds: 300,
    });
    expect(result.success).toBe(false);
  });

  it("rejects planned_focus_seconds below minimum (< 60)", () => {
    const result = createSessionSchema.safeParse({
      energy_level: "medium",
      timer_mode: "preset_1",
      planned_focus_seconds: 30,
      planned_break_seconds: 300,
    });
    expect(result.success).toBe(false);
  });

  it("rejects planned_break_seconds above maximum (> 1h)", () => {
    const result = createSessionSchema.safeParse({
      energy_level: "medium",
      timer_mode: "preset_1",
      planned_focus_seconds: 1500,
      planned_break_seconds: 3601,
    });
    expect(result.success).toBe(false);
  });

  it("strips unknown keys like focus_rating (L-01 default-strip)", () => {
    const result = createSessionSchema.safeParse({
      energy_level: "low",
      timer_mode: "preset_1",
      planned_focus_seconds: 1500,
      planned_break_seconds: 300,
      focus_rating: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("focus_rating");
    }
  });
});

describe("endSessionSchema", () => {
  const base = { focus_rating: 3, ended_at: new Date().toISOString() };

  it("accepts a valid note", () => {
    const result = endSessionSchema.safeParse({ ...base, note: "went well" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe("went well");
    }
  });

  it("rejects a note over 500 characters", () => {
    const result = endSessionSchema.safeParse({ ...base, note: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace from the note", () => {
    const result = endSessionSchema.safeParse({ ...base, note: "  hello  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe("hello");
    }
  });

  it("converts an empty/whitespace-only note to null", () => {
    const result = endSessionSchema.safeParse({ ...base, note: "   " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeNull();
    }
  });

  it("accepts a null or omitted note", () => {
    const withNull = endSessionSchema.safeParse({ ...base, note: null });
    const omitted = endSessionSchema.safeParse(base);
    expect(withNull.success).toBe(true);
    expect(omitted.success).toBe(true);
    if (withNull.success) expect(withNull.data.note).toBeNull();
    if (omitted.success) expect(omitted.data.note).toBeUndefined();
  });
});
