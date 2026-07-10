import { describe, it, expect } from "vitest";
import { createSessionSchema, endSessionSchema, editSessionSchema } from "@/lib/schemas/session";

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

describe("editSessionSchema", () => {
  const base = {
    duration_seconds: 1500,
    energy_level: "medium",
    topic_id: null,
    material_format_id: null,
    focus_rating: 3,
    note: "went well",
  };

  it("accepts a valid full payload", () => {
    const result = editSessionSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects duration_seconds of 0", () => {
    const result = editSessionSchema.safeParse({ ...base, duration_seconds: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative duration_seconds", () => {
    const result = editSessionSchema.safeParse({ ...base, duration_seconds: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects duration_seconds above 24 hours", () => {
    const result = editSessionSchema.safeParse({ ...base, duration_seconds: 24 * 60 * 60 + 1 });
    expect(result.success).toBe(false);
  });

  it("accepts duration_seconds of 1", () => {
    const result = editSessionSchema.safeParse({ ...base, duration_seconds: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts duration_seconds of exactly 24 hours", () => {
    const result = editSessionSchema.safeParse({ ...base, duration_seconds: 24 * 60 * 60 });
    expect(result.success).toBe(true);
  });

  it("accepts a null focus_rating (skip)", () => {
    const result = editSessionSchema.safeParse({ ...base, focus_rating: null });
    expect(result.success).toBe(true);
  });

  it("rejects focus_rating of 0", () => {
    const result = editSessionSchema.safeParse({ ...base, focus_rating: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects focus_rating of 6", () => {
    const result = editSessionSchema.safeParse({ ...base, focus_rating: 6 });
    expect(result.success).toBe(false);
  });

  it("converts an empty note to null", () => {
    const result = editSessionSchema.safeParse({ ...base, note: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeNull();
    }
  });

  it("rejects a note over 500 characters", () => {
    const result = editSessionSchema.safeParse({ ...base, note: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("strips unknown keys like user_id (L-01 default-strip)", () => {
    const result = editSessionSchema.safeParse({ ...base, user_id: crypto.randomUUID(), started_at: "junk" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("user_id");
      expect(result.data).not.toHaveProperty("started_at");
    }
  });
});
