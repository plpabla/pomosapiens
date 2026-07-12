import EnergyPill from "@/components/session/EnergyPill";
import CompletedSessionActions from "@/components/dashboard/CompletedSessionActions";
import type { SessionListItem } from "@/lib/types";

interface Props {
  session: SessionListItem;
  status: "done" | "in_progress";
  readOnly: boolean;
}

export default function SessionTileCorner({ session, status, readOnly }: Props) {
  return (
    <div className="absolute top-2.5 right-2.5 flex items-center gap-2">
      <EnergyPill energyLevel={session.energy_level} />
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
  );
}
