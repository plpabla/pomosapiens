import EnergyPill from "@/components/session/EnergyPill";
import SessionTags from "@/components/session/SessionTags";
import { formatDuration, tomatoCount } from "@/lib/session/format";
import type { SessionListItem } from "@/lib/types";

export type ChartSession = Pick<
  SessionListItem,
  "started_at" | "focus_rating" | "duration_seconds" | "energy_level" | "topic" | "material_format"
>;

interface FocusRatingChartTooltipProps {
  active?: boolean;
  payload?: { payload: ChartSession }[];
}

export function formatTick(iso: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(new Date(iso));
}

export default function FocusRatingChartTooltip({ active, payload }: FocusRatingChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const session = payload[0].payload;
  const tomatoes = tomatoCount(session.duration_seconds);
  const tomatoDisplay = tomatoes >= 5 ? `${"🍅".repeat(4)}…` : "🍅".repeat(tomatoes);

  return (
    <div className="bg-card border-charred min-w-[140px] space-y-2 rounded border p-3 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <span className="text-off-white text-sm font-semibold">{formatTick(session.started_at)}</span>
        <span className="text-off-white text-sm font-semibold">{session.focus_rating} / 5</span>
      </div>
      <div className="flex items-center gap-2">
        <EnergyPill energyLevel={session.energy_level} />
        <span className="text-ash text-xs">
          {`${formatDuration(session.duration_seconds)} ${tomatoDisplay}`.trim()}
        </span>
      </div>
      <SessionTags session={session} />
    </div>
  );
}
