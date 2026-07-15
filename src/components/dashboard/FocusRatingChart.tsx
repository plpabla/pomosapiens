import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import EnergyPill from "@/components/session/EnergyPill";
import SessionTags from "@/components/session/SessionTags";
import { formatDuration, tomatoCount } from "@/lib/session/format";
import type { SessionListItem } from "@/lib/types";

type ChartSession = Pick<
  SessionListItem,
  "started_at" | "focus_rating" | "duration_seconds" | "energy_level" | "topic" | "material_format"
>;

interface FocusRatingChartProps {
  sessions: ChartSession[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: ChartSession }[];
}

function formatTick(iso: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(new Date(iso));
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
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

export default function FocusRatingChart({ sessions }: FocusRatingChartProps) {
  if (sessions.length < 2) {
    return (
      <Card className="border-charred bg-transparent p-6 text-center shadow-none">
        <p className="text-ash text-sm">Rate a few sessions to see your focus trend.</p>
      </Card>
    );
  }

  return (
    <div data-testid="focus-rating-chart" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sessions}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="started_at" tickFormatter={formatTick} />
          <YAxis domain={[1, 5]} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="focus_rating" stroke="var(--color-chart-focus)" dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
