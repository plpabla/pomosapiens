import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import FocusRating from "@/components/session/FocusRating";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { useBreakTimer } from "@/lib/timer/useBreakTimer";
import { formatTime } from "@/lib/timer/formatTime";
import { useTabTitle } from "@/lib/timer/useTabTitle";
import { getRunningTabTitle } from "@/lib/timer/tabTitle";

interface Props {
  sessionId: string;
  startedAtMs: number;
  focusSeconds: number;
  mode?: "preset" | "count_up";
  breakSeconds?: number | null;
}

const FOCUS_DONE = ["✅ Focus done!", "⏰ ⏰ ⏰"] as const;

export default function SessionRunner({
  sessionId,
  startedAtMs,
  focusSeconds,
  mode = "preset",
  breakSeconds = null,
}: Props) {
  const { phase, remaining, elapsed, stoppedAtMs, stopEarly, audioRef } = useFocusTimer({
    startedAtMs,
    focusSeconds,
    mode,
  });
  const [error, setError] = useState<string | null>(null);
  const [internalPhase, setInternalPhase] = useState<"rating" | "running_break">("rating");
  const [breakStartedAtMs, setBreakStartedAtMs] = useState<number | null>(null);
  const [breakComplete, setBreakComplete] = useState(false);

  const { remaining: breakRemaining } = useBreakTimer({
    breakStartedAtMs,
    breakSeconds: breakSeconds ?? 0,
    audioRef,
    onComplete: () => {
      setBreakComplete(true);
    },
  });

  // useBreakTimer already called play(); wait for the chime to finish before
  // navigating so the audio is not cut off by page unload.
  useEffect(() => {
    if (!breakComplete) return;
    const audio = audioRef.current;
    if (!audio) {
      window.location.assign("/dashboard");
      return;
    }
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      window.location.assign("/dashboard");
    };
    audio.addEventListener("ended", go, { once: true });
    const timeoutId = setTimeout(go, 5000); // fallback if ended never fires
    return () => {
      clearTimeout(timeoutId);
      audio.removeEventListener("ended", go);
    };
  }, [breakComplete, audioRef]);

  const title = getRunningTabTitle({ phase, internalPhase, mode, remaining, elapsed, breakRemaining });
  const alert = phase === "rating" && internalPhase === "rating" ? FOCUS_DONE : null;
  useTabTitle({ title, alert });

  async function submitRating(rating: number | null, note: string | null) {
    if (stoppedAtMs === null) return;
    setError(null);

    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focus_rating: rating,
        ended_at: new Date(stoppedAtMs).toISOString(),
        note,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const message = body.error ?? "Failed to save session";
      setError(message);
      throw new Error(message);
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

  if (internalPhase === "running_break") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4 text-center">
        <div className="text-off-white font-mono text-7xl font-bold tabular-nums">{formatTime(breakRemaining)}</div>
        <p className="text-ash text-sm tracking-widest uppercase">Break</p>
        <Button
          variant="outline"
          onClick={() => {
            window.location.assign("/dashboard");
          }}
          className="border-charred text-ash hover:text-off-white mt-4"
        >
          End break
        </Button>
      </div>
    );
  }

  return (
    <FocusRating
      onSubmit={submitRating}
      error={error}
      canTakeBreak={mode !== "count_up" && breakSeconds !== null && breakSeconds > 0}
      onStartNewSession={() => {
        window.location.assign("/session/new");
      }}
      onTakeBreak={() => {
        setBreakStartedAtMs(Date.now());
        setInternalPhase("running_break");
      }}
      onGoToDashboard={() => {
        window.location.assign("/dashboard");
      }}
    />
  );
}
