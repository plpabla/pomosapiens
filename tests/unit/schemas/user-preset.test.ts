import { describe, it, expect } from "vitest";
import { putUserPresetSchema } from "@/lib/schemas/user-preset";

describe("putUserPresetSchema", () => {
  it("accepts valid focus and break seconds", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 1500, break_seconds: 300 });
    expect(result.success).toBe(true);
  });

  it("accepts break_seconds = 0 (no break)", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 60, break_seconds: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts boundary values (min focus, max break)", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 60, break_seconds: 3600 });
    expect(result.success).toBe(true);
  });

  it("accepts boundary values (max focus)", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 4 * 60 * 60, break_seconds: 0 });
    expect(result.success).toBe(true);
  });

  it("rejects focus_seconds below minimum (< 60)", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 30, break_seconds: 300 });
    expect(result.success).toBe(false);
  });

  it("rejects focus_seconds above maximum (> 4h)", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 4 * 60 * 60 + 1, break_seconds: 300 });
    expect(result.success).toBe(false);
  });

  it("rejects break_seconds below zero", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 1500, break_seconds: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects break_seconds above maximum (> 1h)", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 1500, break_seconds: 3601 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer focus_seconds", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 1500.5, break_seconds: 300 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer break_seconds", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 1500, break_seconds: 300.5 });
    expect(result.success).toBe(false);
  });

  it("strips unknown keys (L-01 default-strip)", () => {
    const result = putUserPresetSchema.safeParse({
      focus_seconds: 1500,
      break_seconds: 300,
      slot: 99,
      user_id: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ focus_seconds: 1500, break_seconds: 300 });
    }
  });

  it("rejects missing focus_seconds", () => {
    const result = putUserPresetSchema.safeParse({ break_seconds: 300 });
    expect(result.success).toBe(false);
  });

  it("rejects missing break_seconds", () => {
    const result = putUserPresetSchema.safeParse({ focus_seconds: 1500 });
    expect(result.success).toBe(false);
  });
});
