export type ColorAxis = "topic" | "format";

interface CategorySession {
  topic_id: string | null;
  material_format_id: string | null;
  topic: { name: string } | null;
  material_format: { name: string } | null;
}

export interface PresetColor {
  readonly name: string;
  readonly hex: string;
}

/** 17 curated, well-separated presets for the color-palette dialog's 6-col grid (change.md §Color customization). */
export const PRESET_COLORS: readonly PresetColor[] = [
  { name: "Orange", hex: "#ff5722" },
  { name: "Red", hex: "#e53935" },
  { name: "Crimson", hex: "#dc143c" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Fuchsia", hex: "#d946ef" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Green", hex: "#22c55e" },
  { name: "Lime", hex: "#84cc16" },
  { name: "Gold", hex: "#eab308" },
  { name: "Amber", hex: "#f59e0b" },
];

// Static default palette; used to seed a category's color before any live override
// (Phase 4's useTimelineColors) is persisted.
const DEFAULT_PALETTE: readonly string[] = [
  "#ff5722", // Orange
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#a855f7", // Violet
  "#eab308", // Gold
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#84cc16", // Lime
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic default color for a category id, stable across renders and reloads. */
export function defaultColorFor(categoryId: string): string {
  return DEFAULT_PALETTE[hashString(categoryId) % DEFAULT_PALETTE.length];
}

export function categoryId(axis: ColorAxis, session: CategorySession): string {
  const id = axis === "topic" ? session.topic_id : session.material_format_id;
  return id ?? `unassigned-${axis}`;
}

export function categoryName(axis: ColorAxis, session: CategorySession): string {
  const name = axis === "topic" ? session.topic?.name : session.material_format?.name;
  return name ?? "Unassigned";
}

export interface LegendCategory {
  id: string;
  name: string;
}

/** Dedupes a session list's category ids/names for a legend axis, in first-seen order. */
export function collectCategories(sessions: CategorySession[], axis: ColorAxis): LegendCategory[] {
  const seen = new Map<string, string>();
  for (const session of sessions) {
    const id = categoryId(axis, session);
    if (!seen.has(id)) {
      seen.set(id, categoryName(axis, session));
    }
  }
  return Array.from(seen, ([id, name]) => ({ id, name }));
}
