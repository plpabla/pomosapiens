import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";

interface FocusRatingChartProps {
  sessions: { started_at: string; focus_rating: number }[];
}

function formatTick(iso: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(new Date(iso));
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
          <Tooltip
            labelFormatter={formatTick}
            contentStyle={{
              backgroundColor: "var(--color-card)",
              borderColor: "var(--color-border)",
            }}
            labelStyle={{ color: "var(--color-foreground)" }}
            itemStyle={{ color: "var(--color-foreground)" }}
          />
          <Line type="monotone" dataKey="focus_rating" stroke="var(--color-chart-focus)" dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
