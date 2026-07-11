export function modeLabel(mode: string | null): string | null {
  if (mode === "preset_1") return "P1";
  if (mode === "preset_2") return "P2";
  if (mode === "preset_3") return "P3";
  if (mode === "count_up") return "∞";
  return null;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function getStatus(session: { ended_at: string | null }): "done" | "in_progress" {
  return session.ended_at !== null ? "done" : "in_progress";
}

export function isRated<T extends { ended_at: string | null; focus_rating: number | null }>(
  s: T,
): s is T & { focus_rating: number } {
  return s.ended_at !== null && s.focus_rating !== null;
}

export const energyColorClass: Record<string, string> = {
  high: "text-spark",
  medium: "text-blaze",
  low: "text-ash",
};
