import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  sessionId: string;
  startedAtMs: number;
  focusSeconds: number;
}

type Phase = "running" | "rating" | "submitting";

function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export default function SessionRunner({ sessionId, startedAtMs, focusSeconds }: Props) {
  const [phase, setPhase] = useState<Phase>("running");
  const [now, setNow] = useState(() => Date.now());
  const [stoppedAtMs, setStoppedAtMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stage 2 audio re-prime: warm the chime on mount so the same-document
  // user-activation (from the Start click on /session/new) carries through.
  // This is the load-bearing safeguard for Safari.
  useEffect(() => {
    const audio = new Audio("/audio/chime.mp3");
    audioRef.current = audio;
    audio.muted = true;
    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      })
      .catch(() => {
        // Safari edge: chime may fail open at focus-end
      });
    return () => {
      audio.pause();
      audio.src = "";
      audio.load();
      audioRef.current = null;
    };
  }, []);

  // Wall-clock tick: setTimeout chain (never setInterval) so throttling is harmless.
  useEffect(() => {
    if (phase !== "running") return;

    const id = setTimeout(() => {
      const next = Date.now();
      setNow(next);
      const remaining = focusSeconds - Math.floor((next - startedAtMs) / 1000);
      if (remaining <= 0) {
        // Snapshot the nominal focus-end time so rating delay doesn't pollute duration_seconds
        setStoppedAtMs(startedAtMs + focusSeconds * 1000);
        void audioRef.current?.play().catch(() => {
          // fail open: chime is not critical path
        });
        setPhase("rating");
      }
    }, 1000);

    return () => {
      clearTimeout(id);
    };
  }, [now, phase, startedAtMs, focusSeconds]);

  // visibilitychange reconciliation: correct the timer on tab-return and
  // immediately flip to rating if the focus phase elapsed while hidden.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible" && stoppedAtMs === null) {
        const next = Date.now();
        setNow(next);
        const remaining = focusSeconds - Math.floor((next - startedAtMs) / 1000);
        if (remaining <= 0) {
          setStoppedAtMs(startedAtMs + focusSeconds * 1000);
          void audioRef.current?.play().catch(() => {
            // fail open
          });
          setPhase("rating");
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [stoppedAtMs, startedAtMs, focusSeconds]);

  function handleStopEarly() {
    // Snapshot the actual stop wall-clock so duration_seconds = elapsed, not preset
    setStoppedAtMs(Date.now());
    setPhase("rating");
  }

  async function handleRate(rating: number | null) {
    if (stoppedAtMs === null) return;
    setPhase("submitting");
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
      setPhase("rating");
    }
  }

  const remaining = focusSeconds - Math.floor((now - startedAtMs) / 1000);

  if (phase === "running") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4 text-center">
        <div className="text-off-white font-mono text-7xl font-bold tabular-nums">{formatTime(remaining)}</div>
        <p className="text-ash text-sm tracking-widest uppercase">Focus session</p>
        <Button
          variant="outline"
          onClick={handleStopEarly}
          className="border-charred text-ash hover:text-off-white mt-4"
        >
          Stop early
        </Button>
      </div>
    );
  }

  // phase is "rating" | "submitting" from here (TypeScript-narrowed after running return above)
  const submitting = phase === "submitting";
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
