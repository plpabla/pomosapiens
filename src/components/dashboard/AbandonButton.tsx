import ConfirmActionButton from "@/components/dashboard/ConfirmActionButton";
import { fetchJson } from "@/lib/api/fetchJson";

interface Props {
  sessionId: string;
}

export default function AbandonButton({ sessionId }: Props) {
  return (
    <ConfirmActionButton
      label="Abandon"
      pendingLabel="Abandoning..."
      onConfirm={async () => {
        await fetchJson(`/api/sessions/${sessionId}`, {
          method: "DELETE",
          fallbackError: "Failed to abandon session",
        });

        window.location.reload();
      }}
    />
  );
}
