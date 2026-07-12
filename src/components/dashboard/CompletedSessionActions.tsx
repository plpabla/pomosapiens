import { useState } from "react";
import EditSessionDialog from "@/components/dashboard/EditSessionDialog";
import SessionActionsMenu from "@/components/dashboard/SessionActionsMenu";
import DeleteSessionDialog from "@/components/dashboard/DeleteSessionDialog";

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
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <SessionActionsMenu
        onEdit={() => {
          setEditOpen(true);
        }}
        onDelete={() => {
          setDeleteOpen(true);
        }}
      />

      <EditSessionDialog
        id={props.id}
        startedAt={props.startedAt}
        durationSeconds={props.durationSeconds}
        energyLevel={props.energyLevel}
        topicId={props.topicId}
        materialFormatId={props.materialFormatId}
        focusRating={props.focusRating}
        note={props.note}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <DeleteSessionDialog sessionId={props.id} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
