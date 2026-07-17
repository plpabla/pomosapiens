import { useState, useSyncExternalStore } from "react";
import { Card, CardContent } from "@/components/ui/card";
import DayRow from "@/components/timeline/DayRow";
import TimeAxisHeader from "@/components/timeline/TimeAxisHeader";
import TimelineEmptyState from "@/components/timeline/TimelineEmptyState";
import TimelineShell from "@/components/timeline/TimelineShell";
import Toolbar from "@/components/timeline/Toolbar";
import {
  addDays,
  axisTicks,
  clampAnchor,
  rangeForScale,
  rangeLabel,
  shiftAnchor,
  startOfDay,
  type Scale,
} from "@/lib/timeline/dateRange";
import { useHoursRange } from "@/lib/timeline/useHoursRange";
import type { SessionListItem } from "@/lib/types";

interface TimelineAppProps {
  sessions: SessionListItem[];
  error: string | null;
}

function subscribe() {
  return () => undefined;
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export default function TimelineApp({ sessions, error }: TimelineAppProps) {
  // Cloudflare Workers SSR runs UTC; every local-date computation below must
  // wait for this client-only mount gate, mirroring LocalDateTime.tsx.
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [scale, setScale] = useState<Scale>("week");
  const [anchorOverride, setAnchorOverride] = useState<Date | null>(null);
  const [hoursRange, setHoursRange] = useHoursRange();

  if (!mounted) {
    return <TimelineShell />;
  }

  if (error) {
    return (
      <TimelineShell>
        <Card className="border-charred bg-transparent p-6 text-center shadow-none">
          <CardContent className="px-0">
            <p className="text-ash text-sm">{error}</p>
          </CardContent>
        </Card>
      </TimelineShell>
    );
  }

  const today = startOfDay(new Date());

  if (sessions.length === 0) {
    return (
      <TimelineShell>
        <TimelineEmptyState />
      </TimelineShell>
    );
  }

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

  const sessionsByDay = new Map<number, SessionListItem[]>();
  for (const session of sessions) {
    const key = startOfDay(new Date(session.started_at)).getTime();
    const bucket = sessionsByDay.get(key);
    if (bucket) {
      bucket.push(session);
    } else {
      sessionsByDay.set(key, [session]);
    }
  }

  const ticks = axisTicks(hoursRange);

  return (
    <TimelineShell>
      <Toolbar
        scale={scale}
        onScaleChange={setScale}
        label={label}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrev={() => {
          setAnchorOverride(shiftAnchor(anchor, scale, -1));
        }}
        onNext={() => {
          setAnchorOverride(shiftAnchor(anchor, scale, 1));
        }}
        onToday={() => {
          setAnchorOverride(null);
        }}
        hoursRange={hoursRange}
        onHoursRangeChange={setHoursRange}
      />

      <Card>
        <CardContent className="px-4">
          <TimeAxisHeader hoursRange={hoursRange} />
          {days.map((day) => (
            <DayRow
              key={day.getTime()}
              date={day}
              sessions={sessionsByDay.get(day.getTime()) ?? []}
              scale={scale}
              hoursRange={hoursRange}
              ticks={ticks}
              isToday={day.getTime() === today.getTime()}
            />
          ))}
        </CardContent>
      </Card>
    </TimelineShell>
  );
}
