import { useState } from "react";
import EditSessionDialog from "@/components/dashboard/EditSessionDialog";
import DeleteSessionButton from "@/components/dashboard/DeleteSessionButton";

type EnergyLevel = "low" | "medium" | "high";

interface Props {
  id: string;
  startedAt: string;
  durationSeconds: number;
  energyLevel: EnergyLevel;
  topicId: string | null;
  materialFormatId: string | null;
  focusRating: number | null;
  note: string | null;
}

export default function CompletedSessionActions(props: Props) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex justify-end gap-2">
      {!deleting && (
        <EditSessionDialog
          id={props.id}
          startedAt={props.startedAt}
          durationSeconds={props.durationSeconds}
          energyLevel={props.energyLevel}
          topicId={props.topicId}
          materialFormatId={props.materialFormatId}
          focusRating={props.focusRating}
          note={props.note}
        />
      )}
      <DeleteSessionButton
        sessionId={props.id}
        onPhaseChange={(phase) => {
          setDeleting(phase !== "idle");
        }}
      />
    </div>
  );
}
