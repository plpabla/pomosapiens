import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";

interface Props {
  sessionId: string;
  startedAtMs: number;
  focusSeconds: number;
  mode?: "preset" | "count_up";
}

function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export default function SessionRunner({ sessionId, startedAtMs, focusSeconds, mode = "preset" }: Props) {
  const { phase, remaining, elapsed, stoppedAtMs, stopEarly } = useFocusTimer({ startedAtMs, focusSeconds, mode });
  const [submitPhase, setSubmitPhase] = useState<"rating" | "submitting">("rating");
  const [error, setError] = useState<string | null>(null);

  async function handleRate(rating: number | null) {
    if (stoppedAtMs === null) return;
    setSubmitPhase("submitting");
    setError(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          focus_rating: rating,
          ended_at: new Date(stoppedAtMs).toISOString(),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to save session");
      }

      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitPhase("rating");
    }
  }

  if (phase === "running") {
    const display = mode === "count_up" ? elapsed : remaining;
    const label = mode === "count_up" ? "Count-up session" : "Focus session";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4 text-center">
        <div className="text-off-white font-mono text-7xl font-bold tabular-nums">{formatTime(display)}</div>
        <p className="text-ash text-sm tracking-widest uppercase">{label}</p>
        <Button variant="outline" onClick={stopEarly} className="border-charred text-ash hover:text-off-white mt-4">
          Stop early
        </Button>
      </div>
    );
  }

  const submitting = submitPhase === "submitting";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4 text-center">
      <h2 className="text-off-white text-2xl font-bold">How was your focus?</h2>
      <div className="flex gap-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            disabled={submitting}
            onClick={() => void handleRate(n)}
            className="bg-ember border-charred text-off-white hover:bg-blaze h-14 w-14 text-xl font-bold"
          >
            {n}
          </Button>
        ))}
      </div>
      <ServerError message={error} />
      <Button
        variant="ghost"
        disabled={submitting}
        onClick={() => void handleRate(null)}
        className="text-ash hover:text-off-white"
      >
        {submitting ? "Saving..." : "Skip"}
      </Button>
    </div>
  );
}
