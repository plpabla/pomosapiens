import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";

type Phase = "idle" | "confirming" | "submitting";

function ActionButton(props: React.ComponentProps<typeof Button>) {
  return <Button size="sm" {...props} />;
}

interface Props {
  label: string;
  confirmingLabel?: string;
  pendingLabel: string;
  onConfirm: () => Promise<void>;
  onPhaseChange?: (phase: Phase) => void;
}

export default function ConfirmActionButton({
  label,
  confirmingLabel = "Confirm?",
  pendingLabel,
  onConfirm,
  onPhaseChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  async function handleConfirm() {
    setPhase("submitting");
    setError(null);

    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
    }
  }

  const submitting = phase === "submitting";
  return (
    <div className="flex flex-col items-end gap-2">
      {phase === "idle" ? (
        <ActionButton
          variant="outline"
          onClick={() => {
            setError(null);
            setPhase("confirming");
          }}
        >
          {label}
        </ActionButton>
      ) : (
        <div className="flex gap-2">
          <ActionButton
            variant="destructive"
            disabled={submitting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {submitting ? pendingLabel : confirmingLabel}
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              setError(null);
              setPhase("idle");
            }}
          >
            Cancel
          </ActionButton>
        </div>
      )}
      <ServerError message={error} />
    </div>
  );
}
