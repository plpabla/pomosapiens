import { useSyncExternalStore } from "react";
import { Card, CardContent } from "@/components/ui/card";
import Legend from "@/components/timeline/Legend";
import SessionDetailDialog from "@/components/timeline/SessionDetailDialog";
import TimelineEmptyState from "@/components/timeline/TimelineEmptyState";
import TimelineGrid from "@/components/timeline/TimelineGrid";
import TimelineShell from "@/components/timeline/TimelineShell";
import Toolbar from "@/components/timeline/Toolbar";
import { deriveTimelineView } from "@/lib/timeline/deriveView";
import { shiftAnchor, startOfDay } from "@/lib/timeline/dateRange";
import { useTimelineViewState } from "@/lib/timeline/useTimelineViewState";
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
  const view = useTimelineViewState(sessions);

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

  if (sessions.length === 0) {
    return (
      <TimelineShell>
        <TimelineEmptyState />
      </TimelineShell>
    );
  }

  const today = startOfDay(new Date());
  const derived = deriveTimelineView({
    sessions,
    scale: view.scale,
    anchorOverride: view.anchorOverride,
    hoursRange: view.hoursRange,
    topicFilter: view.topicFilter,
    formatFilter: view.formatFilter,
    today,
  });

  return (
    <TimelineShell>
      <Toolbar
        scale={view.scale}
        onScaleChange={view.changeScale}
        label={derived.label}
        canGoPrev={derived.canGoPrev}
        canGoNext={derived.canGoNext}
        onPrev={() => {
          view.setAnchorOverride(shiftAnchor(derived.anchor, view.scale, -1));
        }}
        onNext={() => {
          view.setAnchorOverride(shiftAnchor(derived.anchor, view.scale, 1));
        }}
        onToday={() => {
          view.setAnchorOverride(null);
        }}
        hoursRange={view.hoursRange}
        onHoursRangeChange={view.setHoursRange}
        colorBy={view.colorBy}
        onColorByChange={view.setColorBy}
        focusOn={view.focusOn}
        energyOn={view.energyOn}
        dotsOn={view.dotsOn}
        onToggleFocus={view.toggleFocus}
        onToggleEnergy={view.toggleEnergy}
        onToggleDots={view.toggleDots}
      />

      <Legend
        topics={derived.topics}
        formats={derived.formats}
        topicFilter={view.topicFilter}
        formatFilter={view.formatFilter}
        onToggleTopic={view.toggleTopic}
        onToggleFormat={view.toggleFormat}
      />

      <TimelineGrid
        days={derived.days}
        sessionsByDay={derived.sessionsByDay}
        scale={view.scale}
        hoursRange={view.hoursRange}
        ticks={derived.ticks}
        today={today}
        colorBy={view.colorBy}
        focusOn={view.focusOn}
        energyOn={view.energyOn}
        dotsOn={view.dotsOn}
        onSelectSession={view.setSelectedSession}
      />

      <SessionDetailDialog
        session={view.selectedSession}
        onOpenChange={(open) => {
          if (!open) view.setSelectedSession(null);
        }}
      />
    </TimelineShell>
  );
}
