export function tomatoCount(durationSeconds: number): number {
  return Math.floor(durationSeconds / 1200);
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)} min.`;
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
