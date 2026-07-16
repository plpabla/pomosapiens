import { useState, useSyncExternalStore } from "react";
import { Card, CardContent } from "@/components/ui/card";
import TimelineEmptyState from "@/components/timeline/TimelineEmptyState";
import TimelineShell from "@/components/timeline/TimelineShell";
import Toolbar from "@/components/timeline/Toolbar";
import { clampAnchor, rangeForScale, rangeLabel, shiftAnchor, startOfDay, type Scale } from "@/lib/timeline/dateRange";
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
      />
    </TimelineShell>
  );
}
