import { Card } from "@/components/ui/card";
import LocalDateTime from "@/components/dashboard/LocalDateTime";
import InProgressSessionActions from "@/components/dashboard/InProgressSessionActions";
import SessionTileCorner from "@/components/session/SessionTileCorner";
import SessionSummaryRow from "@/components/session/SessionSummaryRow";
import SessionTags from "@/components/session/SessionTags";
import { getStatus } from "@/lib/session/format";
import type { SessionListItem } from "@/lib/types";

interface Props {
  session: SessionListItem;
  readOnly?: boolean;
}

export default function SessionTile({ session, readOnly = false }: Props) {
  const status = getStatus(session);

  return (
    <Card className="border-charred bg-ember text-off-white relative gap-1.5 rounded-lg px-3.5 py-3 pr-9 shadow-none">
      <SessionTileCorner session={session} status={status} readOnly={readOnly} />

      <LocalDateTime iso={session.started_at} className="text-off-white/70 text-xs" />

      <SessionSummaryRow
        status={status}
        durationSeconds={session.duration_seconds}
        focusRating={session.focus_rating}
      />

      <SessionTags session={session} />
      {session.note !== null && <p className="text-off-white/70 text-sm italic">{session.note}</p>}

      {status === "in_progress" && !readOnly && <InProgressSessionActions sessionId={session.id} />}
    </Card>
  );
}
