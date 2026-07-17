export type ColorAxis = "topic" | "format";

interface CategorySession {
  topic_id: string | null;
  material_format_id: string | null;
  topic: { name: string } | null;
  material_format: { name: string } | null;
}

// Static default palette; Phase 4 extends this file with the full 17-preset grid and
// live per-category overrides persisted to localStorage.
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
