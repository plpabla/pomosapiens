import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import FocusRating from "@/components/session/FocusRating";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { useBreakTimer } from "@/lib/timer/useBreakTimer";
import { formatTime } from "@/lib/timer/formatTime";
import { useTabTitle } from "@/lib/timer/useTabTitle";
import { getRunningTabTitle } from "@/lib/timer/tabTitle";
import { remotePersistence, type EndSessionArgs } from "@/lib/session/persistence";

interface Props {
  sessionId: string;
  startedAtMs: number;
  focusSeconds: number;
  mode?: "preset" | "count_up";
  breakSeconds?: number | null;
  persistEnd?: (args: EndSessionArgs) => Promise<void>;
  onGoToDashboard?: () => void;
  onStartNewSession?: () => void;
}

const FOCUS_DONE = ["✅ Focus done!", "⏰ ⏰ ⏰"] as const;
const BREAK_OVER = ["Break over!", "⏰ ⏰ ⏰"] as const;

export default function SessionRunner({
  sessionId,
  startedAtMs,
  focusSeconds,
  mode = "preset",
  breakSeconds = null,
  persistEnd = (args) => remotePersistence.endSession(sessionId, args),
  onGoToDashboard = () => {
    window.location.assign("/dashboard");
  },
  onStartNewSession = () => {
    window.location.assign("/session/new");
  },
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
  const [breakDoneWhileHidden, setBreakDoneWhileHidden] = useState(false);

  const { remaining: breakRemaining } = useBreakTimer({
    breakStartedAtMs,
    breakSeconds: breakSeconds ?? 0,
    audioRef,
    onComplete: () => {
      setBreakDoneWhileHidden(document.hidden);
      setBreakComplete(true);
    },
  });

  // useBreakTimer already called play(); wait for the chime to finish before
  // navigating so the audio is not cut off by page unload. Hidden-tab
  // completions defer navigation to the alert dismiss instead (see alert below).
  useEffect(() => {
    if (!breakComplete) return;
    if (breakDoneWhileHidden) return;
    const audio = audioRef.current;
    if (!audio) {
      onGoToDashboard();
      return;
    }
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      onGoToDashboard();
    };
    audio.addEventListener("ended", go, { once: true });
    const timeoutId = setTimeout(go, 5000); // fallback if ended never fires
    return () => {
      clearTimeout(timeoutId);
      audio.removeEventListener("ended", go);
    };
  }, [breakComplete, breakDoneWhileHidden, audioRef, onGoToDashboard]);

  const title = getRunningTabTitle({ phase, internalPhase, mode, remaining, elapsed, breakRemaining });
  const alert =
    breakComplete && breakDoneWhileHidden
      ? BREAK_OVER
      : phase === "rating" && internalPhase === "rating"
        ? FOCUS_DONE
        : null;
  const onAlertDismiss =
    breakComplete && breakDoneWhileHidden
      ? () => {
          onGoToDashboard();
        }
      : undefined;
  useTabTitle({ title, alert, onAlertDismiss });

  async function submitRating(rating: number | null, note: string | null) {
    if (stoppedAtMs === null) return;
    setError(null);

    try {
      await persistEnd({
        focus_rating: rating,
        ended_at: new Date(stoppedAtMs).toISOString(),
        note,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save session";
      setError(message);
      throw err;
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
            onGoToDashboard();
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
      onStartNewSession={onStartNewSession}
      onTakeBreak={() => {
        setBreakStartedAtMs(Date.now());
        setInternalPhase("running_break");
      }}
      onGoToDashboard={onGoToDashboard}
    />
  );
}
