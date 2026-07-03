// Enforces L-03 (timer resilience: wall-clock derive) and L-02 (audio autoplay prime contract).
import { useEffect, useRef, useState } from "react";

interface UseFocusTimerOptions {
  startedAtMs: number;
  focusSeconds: number;
  mode?: "preset" | "count_up";
}

interface UseFocusTimerResult {
  phase: "running" | "rating";
  remaining: number;
  elapsed: number;
  stoppedAtMs: number | null;
  stopEarly: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export function useFocusTimer({
  startedAtMs,
  focusSeconds,
  mode = "preset",
}: UseFocusTimerOptions): UseFocusTimerResult {
  const [phase, setPhase] = useState<"running" | "rating">("running");
  const [now, setNow] = useState(() => Date.now());
  const [stoppedAtMs, setStoppedAtMs] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stage 2 audio re-prime: warm the chime on mount so the same-document
  // user-activation carries through to the unmuted play at focus-end (L-02).
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
        // fail open: Safari edge -- chime may fail at focus-end
      });
    return () => {
      audio.pause();
      audio.src = "";
      audio.load();
      audioRef.current = null;
    };
  }, []);

  // Wall-clock tick: setTimeout chain (never setInterval) so throttling is harmless (L-03).
  useEffect(() => {
    if (phase !== "running") return;

    const id = setTimeout(() => {
      const next = Date.now();
      setNow(next);
      if (mode === "count_up") return;
      const remaining = focusSeconds - Math.floor((next - startedAtMs) / 1000);
      if (remaining <= 0) {
        setStoppedAtMs(startedAtMs + focusSeconds * 1000);
        void audioRef.current?.play().catch(() => {
          // fail open
        });
        setPhase("rating");
      }
    }, 1000);

    return () => {
      clearTimeout(id);
    };
  }, [now, phase, startedAtMs, focusSeconds, mode]);

  // visibilitychange reconciliation: correct the timer on tab-return and
  // immediately flip to rating if the focus phase elapsed while hidden (L-03).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible" && stoppedAtMs === null) {
        const next = Date.now();
        setNow(next);
        if (mode === "count_up") return;
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
  }, [stoppedAtMs, startedAtMs, focusSeconds, mode]);

  function stopEarly() {
    setStoppedAtMs(Date.now());
    setPhase("rating");
  }

  const remaining = focusSeconds - Math.floor((now - startedAtMs) / 1000);
  const elapsed = Math.max(0, Math.floor((now - startedAtMs) / 1000));

  return { phase, remaining, elapsed, stoppedAtMs, stopEarly, audioRef };
}
