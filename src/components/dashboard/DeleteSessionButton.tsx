import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";

type Phase = "idle" | "confirming" | "submitting";

interface Props {
  sessionId: string;
  onPhaseChange?: (phase: Phase) => void;
}

export default function DeleteSessionButton({ sessionId, onPhaseChange }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  async function handleConfirm() {
    setPhase("submitting");
    setError(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to delete session");
      }

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
    }
  }

  if (phase === "idle") {
    return (
      <div className="flex flex-col items-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setPhase("confirming");
          }}
        >
          Delete
        </Button>
        <ServerError message={error} />
      </div>
    );
  }

  const submitting = phase === "submitting";
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={submitting}
          onClick={() => {
            void handleConfirm();
          }}
        >
          {submitting ? "Deleting..." : "Confirm?"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={submitting}
          onClick={() => {
            setError(null);
            setPhase("idle");
          }}
        >
          Cancel
        </Button>
      </div>
      <ServerError message={error} />
    </div>
  );
}
