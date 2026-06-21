import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";

type EnergyLevel = "low" | "medium" | "high";

const LEVELS: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function EnergyPicker() {
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!energy || submitting) return;

    setSubmitting(true);
    setError(null);

    // Stage 1 audio prime: warm chime resource on the user-gesture tick before navigation
    const a = new Audio("/audio/chime.mp3");
    a.muted = true;
    void a
      .play()
      .then(() => {
        a.pause();
        a.muted = false;
      })
      .catch(() => {
        // audio priming failure is non-fatal
      });

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ energy_level: energy }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to start session");
      }

      const data = (await res.json()) as { id: string };
      window.location.assign("/session/" + data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-16 text-center">
      <h1 className="text-off-white mb-8 text-2xl font-bold">Choose your energy level</h1>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <div className="mb-6 flex justify-center gap-4">
          {LEVELS.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              aria-pressed={energy === value}
              onClick={() => {
                setEnergy(value);
              }}
              className={cn(
                "border px-6",
                energy === value ? "bg-blaze text-off-white border-blaze" : "bg-ember text-off-white border-charred",
              )}
            >
              {label}
            </Button>
          ))}
        </div>
        <ServerError message={error} />
        <Button
          type="submit"
          disabled={energy === null || submitting}
          className="bg-blaze hover:bg-spark text-off-white mt-4 w-full"
        >
          {submitting ? "Starting..." : "Start"}
        </Button>
      </form>
    </div>
  );
}
