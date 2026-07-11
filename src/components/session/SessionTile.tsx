import { Card } from "@/components/ui/card";
import LocalDateTime from "@/components/dashboard/LocalDateTime";
import AbandonButton from "@/components/dashboard/AbandonButton";
import CompletedSessionActions from "@/components/dashboard/CompletedSessionActions";
import SessionTags from "@/components/session/SessionTags";
import RatingBadge from "@/components/session/RatingBadge";
import { formatDuration, getStatus, energyColorClass } from "@/lib/session/format";
import { cn } from "@/lib/utils";
import type { SessionListItem } from "@/lib/types";

interface Props {
  session: SessionListItem;
}

export default function SessionTile({ session }: Props) {
  const status = getStatus(session);
  const energyClass = energyColorClass[session.energy_level] ?? "text-ash";

  return (
    <Card className="border-charred bg-ember text-off-white gap-2 px-5 py-4 shadow-none">
      <div className="flex items-center justify-between">
        <LocalDateTime iso={session.started_at} className="text-off-white/70 text-sm" />
        <span className={cn("text-xs font-semibold uppercase", energyClass)}>{session.energy_level}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-off-white text-sm">
          {status === "done" && session.duration_seconds != null
            ? formatDuration(session.duration_seconds)
            : "In progress"}
        </span>
        <RatingBadge status={status} focusRating={session.focus_rating} />
      </div>
      <SessionTags session={session} />
      {session.note !== null && <p className="text-off-white/70 text-sm">{session.note}</p>}
      {status === "in_progress" && (
        <div className="flex justify-end">
          <AbandonButton sessionId={session.id} />
        </div>
      )}
      {status === "done" && (
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
    </Card>
  );
}
