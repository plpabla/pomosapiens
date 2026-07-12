import type { SessionListItem, Topic } from "@/lib/types";
import type { LocalSession } from "@/lib/local/localSessions";
import { LOCAL_DEFAULT_FORMATS } from "@/lib/local/localCatalog";

// Mirrors the DB's GENERATED duration_seconds column and the dashboard's
// topic/material_format name joins (dashboard.astro:26-27), for local rows.
export function toSessionListItems(sessions: readonly LocalSession[], topics: readonly Topic[]): SessionListItem[] {
  return [...sessions]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map((s) => {
      const topic = s.topic_id === null ? null : (topics.find((t) => t.id === s.topic_id) ?? null);
      const format =
        s.material_format_id === null
          ? null
          : (LOCAL_DEFAULT_FORMATS.find((f) => f.id === s.material_format_id) ?? null);
      return {
        id: s.id,
        started_at: s.started_at,
        energy_level: s.energy_level,
        duration_seconds:
          s.ended_at === null ? null : Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000),
        focus_rating: s.focus_rating,
        ended_at: s.ended_at,
        timer_mode: s.timer_mode,
        note: s.note,
        topic_id: s.topic_id,
        material_format_id: s.material_format_id,
        topic: topic ? { name: topic.name } : null,
        material_format: format ? { name: format.name } : null,
      };
    });
}
