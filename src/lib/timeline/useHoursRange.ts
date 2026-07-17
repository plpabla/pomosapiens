import { useSyncExternalStore } from "react";
import type { HoursRange } from "@/lib/timeline/dateRange";

const HOURS_RANGE_KEY = "pomosapiens.timeline.hours_range";
const DEFAULT_HOURS_RANGE: HoursRange = { start: 6, end: 23 };

function isHoursRange(value: unknown): value is HoursRange {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HoursRange).start === "number" &&
    typeof (value as HoursRange).end === "number"
  );
}

// useSyncExternalStore store for the timeline's visible-hours setting, mirroring
// useLastMode.ts. getSnapshot caches the parsed object against the last-seen raw string so
// repeated calls return a stable reference when localStorage hasn't changed -- required by
// useSyncExternalStore to avoid React's "getSnapshot should be cached" loop guard.
let cachedRaw: string | null = null;
let cachedValue: HoursRange = DEFAULT_HOURS_RANGE;

const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
function getSnapshot(): HoursRange {
  try {
    const raw = localStorage.getItem(HOURS_RANGE_KEY);
    if (raw === cachedRaw) return cachedValue;
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    cachedRaw = raw;
    cachedValue = isHoursRange(parsed) ? parsed : DEFAULT_HOURS_RANGE;
    return cachedValue;
  } catch {
    return DEFAULT_HOURS_RANGE;
  }
}
function getServerSnapshot(): HoursRange {
  return DEFAULT_HOURS_RANGE;
}
function persist(hoursRange: HoursRange) {
  try {
    localStorage.setItem(HOURS_RANGE_KEY, JSON.stringify(hoursRange));
  } catch {
    // fail open: localStorage unavailable (private mode, partitioned storage, etc.)
  }
  listeners.forEach((listener) => {
    listener();
  });
}

export function useHoursRange(): [HoursRange, (hoursRange: HoursRange) => void] {
  const hoursRange = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [hoursRange, persist];
}
