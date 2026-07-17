import { describe, it, expect } from "vitest";
import { collectCategories, defaultColorFor, PRESET_COLORS } from "@/lib/timeline/color";

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe("PRESET_COLORS", () => {
  it("has exactly the 17 curated presets named in the design spec", () => {
    expect(PRESET_COLORS.map((preset) => preset.name)).toEqual([
      "Orange",
      "Red",
      "Crimson",
      "Rose",
      "Pink",
      "Fuchsia",
      "Violet",
      "Indigo",
      "Blue",
      "Sky",
      "Cyan",
      "Teal",
      "Emerald",
      "Green",
      "Lime",
      "Gold",
      "Amber",
    ]);
  });

  it("has unique, valid hex values for every preset", () => {
    const hexes = new Set(PRESET_COLORS.map((preset) => preset.hex.toLowerCase()));
    expect(hexes.size).toBe(PRESET_COLORS.length);
    for (const preset of PRESET_COLORS) {
      expect(preset.hex).toMatch(HEX_RE);
    }
  });

  it("uses the accent orange (#ff5722) as the first preset", () => {
    expect(PRESET_COLORS[0]).toEqual({ name: "Orange", hex: "#ff5722" });
  });
});

describe("defaultColorFor", () => {
  it("is deterministic for the same category id", () => {
    expect(defaultColorFor("topic-1")).toBe(defaultColorFor("topic-1"));
  });

  it("returns a valid hex color", () => {
    expect(defaultColorFor("topic-1")).toMatch(HEX_RE);
  });
});

describe("collectCategories", () => {
  it("dedupes categories in first-seen order", () => {
    const sessions = [
      { topic_id: "t1", material_format_id: null, topic: { name: "Reading" }, material_format: null },
      { topic_id: "t2", material_format_id: null, topic: { name: "Math" }, material_format: null },
      { topic_id: "t1", material_format_id: null, topic: { name: "Reading" }, material_format: null },
    ];
    expect(collectCategories(sessions, "topic")).toEqual([
      { id: "t1", name: "Reading" },
      { id: "t2", name: "Math" },
    ]);
  });
});
