import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import FocusRatingChartTooltip, { formatTick, type ChartSession } from "@/components/dashboard/FocusRatingChartTooltip";

interface FocusRatingChartProps {
  sessions: ChartSession[];
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
          <Tooltip content={<FocusRatingChartTooltip />} />
          <Line type="monotone" dataKey="focus_rating" stroke="var(--color-chart-focus)" dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
