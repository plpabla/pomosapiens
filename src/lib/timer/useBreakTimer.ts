import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface UseBreakTimerOptions {
  breakStartedAtMs: number | null;
  breakSeconds: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  onComplete: () => void;
}

interface UseBreakTimerResult {
  remaining: number;
  cancel: () => void;
}

export function useBreakTimer({
  breakStartedAtMs,
  breakSeconds,
  audioRef,
  onComplete,
}: UseBreakTimerOptions): UseBreakTimerResult {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // Wall-clock tick chain (L-03). Fire completion inside the timeout callback,
  // mirroring useFocusTimer's pattern so the effect body never directly plays chime.
  useEffect(() => {
    if (breakStartedAtMs === null) return;

    // Clamp now to breakStartedAtMs: `now` is initialised at session mount and may
    // predate breakStartedAtMs, which would make currentRemaining incorrectly large.
    const effectiveNow = Math.max(now, breakStartedAtMs);
    const currentRemaining = breakSeconds - Math.floor((effectiveNow - breakStartedAtMs) / 1000);
    if (currentRemaining <= 0) return;

    const id = setTimeout(() => {
      const next = Date.now();
      setNow(next);
      const newRemaining = breakSeconds - Math.floor((next - breakStartedAtMs) / 1000);
      if (newRemaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        void audioRef.current?.play().catch(() => {
          // fail open
        });
        onCompleteRef.current();
      }
    }, 1000);

    return () => {
      clearTimeout(id);
    };
  }, [now, breakStartedAtMs, breakSeconds, audioRef]);

  // visibilitychange reconciliation (L-03).
  useEffect(() => {
    if (breakStartedAtMs === null) return;

    const startMs = breakStartedAtMs;

    function onVisibility() {
      if (document.visibilityState === "visible") {
        const next = Date.now();
        setNow(next);
        const remaining = breakSeconds - Math.floor((next - startMs) / 1000);
        if (remaining <= 0 && !firedRef.current) {
          firedRef.current = true;
          void audioRef.current?.play().catch(() => {
            // fail open
          });
          onCompleteRef.current();
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [breakStartedAtMs, breakSeconds, audioRef]);

  function cancel() {
    onCompleteRef.current();
  }

  const effectiveNow = breakStartedAtMs !== null ? Math.max(now, breakStartedAtMs) : now;
  const remaining =
    breakStartedAtMs === null
      ? breakSeconds
      : Math.max(0, breakSeconds - Math.floor((effectiveNow - breakStartedAtMs) / 1000));

  return { remaining, cancel };
}
