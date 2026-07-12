import { Card } from "@/components/ui/card";
import LocalDateTime from "@/components/dashboard/LocalDateTime";
import AbandonButton from "@/components/dashboard/AbandonButton";
import CompletedSessionActions from "@/components/dashboard/CompletedSessionActions";
import SessionTags from "@/components/session/SessionTags";
import RatingBadge from "@/components/session/RatingBadge";
import { formatDuration, getStatus, tomatoCount } from "@/lib/session/format";
import { cn } from "@/lib/utils";
import type { SessionListItem } from "@/lib/types";

const energyPillClass: Record<string, string> = {
  high: "bg-spark/15 text-spark",
  medium: "bg-blaze/15 text-blaze",
  low: "bg-ash/15 text-ash",
};

interface Props {
  session: SessionListItem;
  readOnly?: boolean;
}

export default function SessionTile({ session, readOnly = false }: Props) {
  const status = getStatus(session);
  const energyPill = energyPillClass[session.energy_level] ?? "bg-ash/15 text-ash";
  const tomatoes = status === "done" && session.duration_seconds != null ? tomatoCount(session.duration_seconds) : 0;

  return (
    <Card className="border-charred bg-ember text-off-white relative gap-1.5 rounded-lg px-3.5 py-3 pr-9 shadow-none">
      <div className="absolute top-2.5 right-2.5 flex items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase", energyPill)}>
          {session.energy_level}
        </span>
        {status === "done" && !readOnly && (
          <CompletedSessionActions
            id={session.id}
            startedAt={session.started_at}
            durationSeconds={session.duration_seconds ?? 0}
            energyLevel={session.energy_level}
            topicId={session.topic_id}
            materialFormatId={session.material_format_id}
            focusRating={session.focus_rating}
            note={session.note}
          />
        )}
      </div>

      <LocalDateTime iso={session.started_at} className="text-off-white/70 text-xs" />

      <div className="flex items-center justify-between gap-2">
        <span className="text-off-white/55 min-w-0 flex-1 truncate text-sm font-medium">
          {status === "done" && session.duration_seconds != null
            ? formatDuration(session.duration_seconds)
            : "In progress"}
          {tomatoes > 0 && ` ${"🍅".repeat(tomatoes)}`}
        </span>
        <RatingBadge status={status} focusRating={session.focus_rating} />
      </div>

      <SessionTags session={session} />
      {session.note !== null && <p className="text-off-white/70 text-sm italic">{session.note}</p>}

      {status === "in_progress" && !readOnly && <AbandonButton sessionId={session.id} />}
    </Card>
  );
}
