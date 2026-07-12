import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";

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
  /** Render the idle action as a full-width button with an optional leading icon. */
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export default function ConfirmActionButton({
  label,
  confirmingLabel = "Confirm?",
  pendingLabel,
  onConfirm,
  onPhaseChange,
  fullWidth = false,
  icon,
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
    <div className={cn("flex flex-col gap-2", fullWidth ? "items-stretch" : "items-end")}>
      {phase === "idle" ? (
        <ActionButton
          variant="outline"
          className={cn(fullWidth && "w-full")}
          onClick={() => {
            setError(null);
            setPhase("confirming");
          }}
        >
          {icon}
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
