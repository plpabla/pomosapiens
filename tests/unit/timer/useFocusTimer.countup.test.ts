import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { stubAudioGlobal, dispatchVisibilityChange } from "../_setup";

const START_MS = 2_000_000;

describe("useFocusTimer count_up mode", () => {
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

  it("elapsed increases by 1 each second", () => {
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: 5, mode: "count_up" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.elapsed).toBe(3);
    expect(result.current.phase).toBe("running");
  });

  it("does not auto-flip to rating via tick when focusSeconds would expire", () => {
    // focusSeconds: 1 so remaining would reach 0 after 1 tick in preset mode.
    // In count_up mode the auto-flip must be suppressed.
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: 1, mode: "count_up" }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.phase).toBe("running");
    // Chime must not have fired.
    const audio = audioStub.instances[0];
    expect(audio.play).not.toHaveBeenCalledTimes(2); // only the prime call (once on mount)
  });

  it("does not auto-flip to rating via visibilitychange when focus elapsed while hidden", () => {
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: 1, mode: "count_up" }));
    act(() => {
      dispatchVisibilityChange("hidden");
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      dispatchVisibilityChange("visible");
    });
    expect(result.current.phase).toBe("running");
  });
});
