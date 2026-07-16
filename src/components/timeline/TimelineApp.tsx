import { useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TimelineEmptyState from "@/components/timeline/TimelineEmptyState";
import { clampAnchor, rangeForScale, rangeLabel, shiftAnchor, startOfDay, type Scale } from "@/lib/timeline/dateRange";
import type { SessionListItem } from "@/lib/types";

interface TimelineAppProps {
  sessions: SessionListItem[];
  error: string | null;
}

const SCALE_OPTIONS: { value: Scale; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

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

  const header = (
    <div className="mb-8">
      <h1 className="text-off-white text-2xl font-semibold">Focus Timeline</h1>
      <p className="text-ash text-sm">Session history across topics and formats</p>
    </div>
  );

  if (!mounted) {
    return (
      <div className="bg-cosmic flex-1 p-4">
        <div className="mx-auto max-w-[1440px]">{header}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-cosmic flex-1 p-4">
        <div className="mx-auto max-w-[1440px]">
          {header}
          <Card className="border-charred bg-transparent p-6 text-center shadow-none">
            <CardContent className="px-0">
              <p className="text-ash text-sm">{error}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const today = startOfDay(new Date());

  if (sessions.length === 0) {
    return (
      <div className="bg-cosmic flex-1 p-4">
        <div className="mx-auto max-w-[1440px] space-y-6">
          {header}
          <TimelineEmptyState />
        </div>
      </div>
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

  function handleScaleChange(next: string) {
    setScale(next as Scale);
  }

  function goPrev() {
    setAnchorOverride(shiftAnchor(anchor, scale, -1));
  }

  function goNext() {
    setAnchorOverride(shiftAnchor(anchor, scale, 1));
  }

  function goToday() {
    setAnchorOverride(null);
  }

  return (
    <div className="bg-cosmic flex-1 p-4">
      <div className="mx-auto max-w-[1440px] space-y-6">
        {header}

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center gap-4">
            <Select value={scale} onValueChange={handleScaleChange}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCALE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled={!canGoPrev} onClick={goPrev} aria-label="Previous">
                ‹
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
              <Button variant="outline" size="icon" disabled={!canGoNext} onClick={goNext} aria-label="Next">
                ›
              </Button>
            </div>

            <span className="text-off-white text-sm font-medium">{label}</span>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
