import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ServerError } from "@/components/auth/ServerError";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { useBreakTimer } from "@/lib/timer/useBreakTimer";

interface Props {
  sessionId: string;
  startedAtMs: number;
  focusSeconds: number;
  mode?: "preset" | "count_up";
  breakSeconds?: number | null;
}

function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

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
  const [submitPhase, setSubmitPhase] = useState<"rating" | "submitting">("rating");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [internalPhase, setInternalPhase] = useState<"rating" | "break_offer" | "running_break">("rating");
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
          note: note.trim() === "" ? null : note.trim(),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to save session");
      }

      if (mode === "count_up" || breakSeconds === null || breakSeconds <= 0) {
        window.location.assign("/dashboard");
      } else {
        setInternalPhase("break_offer");
      }
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

  if (internalPhase === "break_offer") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4 text-center">
        <h2 className="text-off-white text-2xl font-bold">Take a break?</h2>
        <p className="text-ash text-sm">{formatTime(breakSeconds ?? 0)} break</p>
        <div className="flex gap-4">
          <Button
            onClick={() => {
              setBreakStartedAtMs(Date.now());
              setInternalPhase("running_break");
            }}
            className="bg-ember border-charred text-off-white hover:bg-blaze"
          >
            Take a break
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              window.location.assign("/dashboard");
            }}
            className="text-ash hover:text-off-white"
          >
            Skip
          </Button>
        </div>
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
      <div className="flex w-full max-w-sm flex-col gap-2 text-left">
        <Label htmlFor="session-note" className="text-ash">
          Add a note (optional)
        </Label>
        <Textarea
          id="session-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
          maxLength={500}
          disabled={submitting}
        />
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
