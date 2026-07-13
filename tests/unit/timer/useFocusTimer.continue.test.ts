// Pins Phase 2 of continue-session-past-end: continueAsCountUp() resumes running
// without resetting elapsed, and suppresses chime re-fire (S-10).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { stubAudioGlobal } from "../_setup";

const START_MS = 3_000_000;

describe("useFocusTimer continueAsCountUp", () => {
  let audioStub: ReturnType<typeof stubAudioGlobal>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "queueMicrotask"] });
    vi.setSystemTime(START_MS);
    audioStub = stubAudioGlobal();
  });

  afterEach(() => {
    cleanup();
    audioStub.restore();
    vi.useRealTimers();
  });

  it("after focus-end fire, resumes running in count_up with elapsed preserved from startedAtMs", () => {
    // focusSeconds: 1 so the boundary is reached in a single tick, mirroring the fire test above.
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: 1 }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe("rating");

    act(() => {
      result.current.continueAsCountUp();
    });
    expect(result.current.phase).toBe("running");
    expect(result.current.mode).toBe("count_up");
    expect(result.current.elapsed).toBe(1);

    // Each tick requires its own act() so React flushes state and re-schedules the next timeout.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.elapsed).toBe(3);
  });

  it("does not re-fire the chime after continueAsCountUp, even past a further boundary", () => {
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: 1 }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const audio = audioStub.instances[0];
    const playCallsAtFocusEnd = audio.play.mock.calls.length;

    act(() => {
      result.current.continueAsCountUp();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.phase).toBe("running");
    expect(audio.play).toHaveBeenCalledTimes(playCallsAtFocusEnd);
  });
});
