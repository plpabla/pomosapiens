export type Scale = "day" | "week" | "month";

export interface DateRange {
  /** Local midnight of the first visible day. */
  start: Date;
  /** Local midnight of the first day AFTER the last visible day (exclusive). */
  end: Date;
}

export interface HoursRange {
  start: number;
  end: number;
}

export interface IsoWeekInfo {
  week: number;
  label: string;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Days since Monday for the week containing `date` (0 = Monday .. 6 = Sunday). */
function daysSinceMonday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function isoWeek(date: Date): IsoWeekInfo {
  // Standard ISO-8601 week-number algorithm: shift to the Thursday of the
  // same week, then count weeks from that ISO year's first Thursday.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, label: `CW${String(week)}` };
}

export function rangeForScale(anchor: Date, scale: Scale): DateRange {
  switch (scale) {
    case "day": {
      const start = startOfDay(anchor);
      return { start, end: addDays(start, 1) };
    }
    case "week": {
      const start = addDays(anchor, -daysSinceMonday(anchor));
      return { start, end: addDays(start, 7) };
    }
    case "month": {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      return { start, end: addMonths(start, 1) };
    }
  }
}

export function shiftAnchor(anchor: Date, scale: Scale, direction: 1 | -1): Date {
  switch (scale) {
    case "day":
      return addDays(anchor, direction);
    case "week":
      return addDays(anchor, 7 * direction);
    case "month":
      return addMonths(anchor, direction);
  }
}

/** Clamps `anchor`'s period (for `scale`) to `[earliest's period, today's period]`, returning the clamped period's start date. */
export function clampAnchor(anchor: Date, scale: Scale, earliest: Date, today: Date): Date {
  const earliestStart = rangeForScale(earliest, scale).start;
  const currentStart = rangeForScale(today, scale).start;
  const anchorStart = rangeForScale(anchor, scale).start;
  if (anchorStart.getTime() < earliestStart.getTime()) return earliestStart;
  if (anchorStart.getTime() > currentStart.getTime()) return currentStart;
  return anchorStart;
}

// Pinned to en-US: the design spec's label formats ("Jul 16", "CW29", "July")
// are literal English strings, not meant to follow the visitor's browser locale.
const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const weekPartFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const weekPartFormatterWithYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const monthLabelFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

export function rangeLabel(anchor: Date, scale: Scale): string {
  const range = rangeForScale(anchor, scale);
  switch (scale) {
    case "day":
      return dayLabelFormatter.format(range.start);
    case "week": {
      const { label } = isoWeek(range.start);
      const lastDay = addDays(range.end, -1);
      return `${label} · ${weekPartFormatter.format(range.start)} – ${weekPartFormatterWithYear.format(lastDay)}`;
    }
    case "month":
      return monthLabelFormatter.format(range.start);
  }
}

/** Tick hours for the axis header: every 3h when the span exceeds 12h, else every 2h; always includes both endpoints. */
export function axisTicks(hoursRange: HoursRange): number[] {
  const span = hoursRange.end - hoursRange.start;
  const step = span > 12 ? 3 : 2;
  const ticks: number[] = [];
  for (let h = hoursRange.start; h < hoursRange.end; h += step) {
    ticks.push(h);
  }
  if (ticks[ticks.length - 1] !== hoursRange.end) {
    ticks.push(hoursRange.end);
  }
  return ticks;
}
