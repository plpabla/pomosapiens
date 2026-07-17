import { tomatoCount } from "@/lib/session/format";
import type { HoursRange, Scale } from "@/lib/timeline/dateRange";

export const MIN_BLOCK_WIDTH_PERCENT = 2;
export const LABEL_COLUMN_WIDTH_PX = 76;

export const ROW_HEIGHT_PX: Record<Scale, number> = {
  day: 120,
  week: 60,
  month: 22,
};

export interface BlockPosition {
  left: number;
  width: number;
}

export interface PomodoroDots {
  full: number;
  half: boolean;
}

interface SessionTiming {
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Percent position (0-100) of `minutes` (since local midnight) within `hoursRange`, clamped to the range. */
export function axisPercent(minutes: number, hoursRange: HoursRange): number {
  const axisStart = hoursRange.start * 60;
  const axisEnd = hoursRange.end * 60;
  const clamped = Math.min(Math.max(minutes, axisStart), axisEnd);
  return ((clamped - axisStart) / (axisEnd - axisStart)) * 100;
}

/**
 * Maps a session's local start/end onto `hoursRange` as left%/width%, clamped at both
 * edges and floored at `MIN_BLOCK_WIDTH_PERCENT` so very short sessions stay visible.
 * In-progress sessions (`ended_at === null`) derive an end from `started_at + duration_seconds`,
 * or clamp to the axis end when duration is unknown. An end before start (unknown duration,
 * or a session crossing midnight) also clamps to the axis end rather than collapsing to zero width.
 */
export function blockPosition(session: SessionTiming, hoursRange: HoursRange): BlockPosition {
  const start = new Date(session.started_at);
  const left = axisPercent(minutesSinceMidnight(start), hoursRange);

  let right: number;
  if (session.ended_at !== null) {
    right = axisPercent(minutesSinceMidnight(new Date(session.ended_at)), hoursRange);
  } else if (session.duration_seconds !== null) {
    const end = new Date(start.getTime() + session.duration_seconds * 1000);
    right = axisPercent(minutesSinceMidnight(end), hoursRange);
  } else {
    right = 100;
  }

  const width = right < left ? 100 - left : right - left;
  return { left, width: Math.max(width, MIN_BLOCK_WIDTH_PERCENT) };
}

/**
 * Pomodoro-pip count for a session's duration: full dots every 20 min (floored via
 * `tomatoCount`), or a single half-filled dot for durations under 20 min (including
 * unknown/in-progress durations) so short sessions never read as a full pomodoro.
 */
export function pomodoroDots(durationSeconds: number | null): PomodoroDots {
  const duration = durationSeconds ?? 0;
  if (duration < 1200) {
    return { full: 0, half: true };
  }
  return { full: tomatoCount(duration), half: false };
}
