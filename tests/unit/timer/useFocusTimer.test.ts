// Pins L-03 (timer resilience: wall-clock derive) -- test-plan §2 row #1 (timer reconcile across tab background / device sleep).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { stubAudioGlobal, dispatchVisibilityChange } from "../_setup";

const FOCUS_SECONDS = 60;
const START_MS = 1_000_000;

describe("useFocusTimer (risk #1: timer reconcile)", () => {
  let audioStub: ReturnType<typeof stubAudioGlobal>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "queueMicrotask"] });
    vi.setSystemTime(START_MS);
    audioStub = stubAudioGlobal();
  });

  afterEach(() => {
    audioStub.restore();
    vi.useRealTimers();
  });

  it("ticks remaining down once per second", () => {
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: FOCUS_SECONDS }));
    // Each tick requires its own act() so React flushes state and re-schedules the next timeout.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(57);
    expect(result.current.phase).toBe("running");
  });

  it("snapshots stoppedAtMs and flips to rating when focus elapses", () => {
    // focusSeconds: 1 so the boundary (remaining = 0) is reached in a single tick.
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: 1 }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe("rating");
    // stoppedAtMs is the **nominal** end time, not Date.now() at tick fire time --
    // protects duration_seconds from rating-screen latency (L-03).
    expect(result.current.stoppedAtMs).toBe(START_MS + 1_000);
  });

  it("reconciles after tab background: visibilitychange visible computes remaining from wall clock", () => {
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: FOCUS_SECONDS }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    act(() => {
      dispatchVisibilityChange("hidden");
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    // On visible, the handler re-derives remaining from Date.now() (T+35s) -- not from tick count.
    // Broken decrement-only behavior (no visibility reconcile) would give ~58 here.
    act(() => {
      dispatchVisibilityChange("visible");
    });
    expect(result.current.remaining).toBe(25);
  });

  it("flips to rating on visibilitychange visible if focus elapsed while hidden", () => {
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: FOCUS_SECONDS }));
    act(() => {
      dispatchVisibilityChange("hidden");
    });
    // Advance 70s past the 60s focus boundary; handler on visible fires the flip (L-03).
    act(() => {
      vi.advanceTimersByTime(70_000);
    });
    act(() => {
      dispatchVisibilityChange("visible");
    });
    expect(result.current.phase).toBe("rating");
    expect(result.current.stoppedAtMs).toBe(START_MS + 60_000);
  });

  it("stopEarly snapshots Date.now() and flips to rating", () => {
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: FOCUS_SECONDS }));
    vi.setSystemTime(START_MS + 20_000);
    act(() => {
      result.current.stopEarly();
    });
    expect(result.current.phase).toBe("rating");
    // stopEarly records actual elapsed (not nominal end) -- contrast with the focus-elapses test.
    expect(result.current.stoppedAtMs).toBe(START_MS + 20_000);
  });
});
