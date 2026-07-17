import { categoryId, collectCategories, type LegendCategory } from "@/lib/timeline/color";
import {
  addDays,
  axisTicks,
  clampAnchor,
  rangeForScale,
  rangeLabel,
  startOfDay,
  type HoursRange,
  type Scale,
} from "@/lib/timeline/dateRange";
import type { SessionListItem } from "@/lib/types";

export interface TimelineView {
  anchor: Date;
  label: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  days: Date[];
  sessionsByDay: Map<number, SessionListItem[]>;
  ticks: number[];
  topics: LegendCategory[];
  formats: LegendCategory[];
}

interface DeriveTimelineViewParams {
  sessions: SessionListItem[];
  scale: Scale;
  anchorOverride: Date | null;
  hoursRange: HoursRange;
  topicFilter: Set<string>;
  formatFilter: Set<string>;
  today: Date;
}

/** Computes all render-ready derived state for the timeline grid from raw sessions + view state. Assumes `sessions` is non-empty. */
export function deriveTimelineView({
  sessions,
  scale,
  anchorOverride,
  hoursRange,
  topicFilter,
  formatFilter,
  today,
}: DeriveTimelineViewParams): TimelineView {
  const earliest = sessions.reduce<Date>(
    (min, session) => {
      const day = startOfDay(new Date(session.started_at));
      return day.getTime() < min.getTime() ? day : min;
    },
    startOfDay(new Date(sessions[0].started_at)),
  );

  const reference = anchorOverride ?? today;
  const anchor = clampAnchor(reference, scale, earliest, today);
  const label = rangeLabel(anchor, scale);
  const canGoPrev = anchor.getTime() > rangeForScale(earliest, scale).start.getTime();
  const canGoNext = anchor.getTime() < rangeForScale(today, scale).start.getTime();

  const range = rangeForScale(anchor, scale);
  const dayCount = Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000);
  const days = Array.from({ length: dayCount }, (_, index) => addDays(range.start, index));

  const visibleSessions = sessions.filter(
    (session) => topicFilter.has(categoryId("topic", session)) && formatFilter.has(categoryId("format", session)),
  );

  const sessionsByDay = new Map<number, SessionListItem[]>();
  for (const session of visibleSessions) {
    const key = startOfDay(new Date(session.started_at)).getTime();
    const bucket = sessionsByDay.get(key);
    if (bucket) {
      bucket.push(session);
    } else {
      sessionsByDay.set(key, [session]);
    }
  }

  return {
    anchor,
    label,
    canGoPrev,
    canGoNext,
    days,
    sessionsByDay,
    ticks: axisTicks(hoursRange),
    topics: collectCategories(sessions, "topic"),
    formats: collectCategories(sessions, "format"),
  };
}
