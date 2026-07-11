import ConfirmActionButton from "@/components/dashboard/ConfirmActionButton";
import { fetchJson } from "@/lib/api/fetchJson";

type Phase = "idle" | "confirming" | "submitting";

interface Props {
  sessionId: string;
  onPhaseChange?: (phase: Phase) => void;
}

export default function DeleteSessionButton({ sessionId, onPhaseChange }: Props) {
  return (
    <ConfirmActionButton
      label="Delete"
      pendingLabel="Deleting..."
      onPhaseChange={onPhaseChange}
      onConfirm={async () => {
        await fetchJson(`/api/sessions/${sessionId}`, {
          method: "DELETE",
          fallbackError: "Failed to delete session",
        });

        window.location.reload();
      }}
    />
  );
}
