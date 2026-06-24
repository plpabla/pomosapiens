// Pins L-02 (audio autoplay prime contract) -- test-plan §2 row #6 (chime at focus-end, cheapest layer).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { stubAudioGlobal } from "../_setup";

const START_MS = 1_000_000;

describe("useFocusTimer audio (risk #6: chime at focus-end -- L-02)", () => {
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

  it("Stage-2 prime: muted play() then pause() on mount", async () => {
    renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: 60 }));

    // Flush the .then() microtask so pause() and muted = false run before asserting.
    await act(async () => {
      await Promise.resolve();
    });

    const inst = audioStub.instances[0];
    expect(inst).toBeDefined();
    expect(inst.play).toHaveBeenCalledOnce(); // muted prime
    expect(inst.pause).toHaveBeenCalledOnce(); // pause after prime
    expect(inst.muted).toBe(false); // set true on mount, false after .then()
  });

  it("fires audio.play() at focus-end transition and is fail-open if the promise rejects", async () => {
    // focusSeconds: 1 reaches the boundary in a single tick -- mirrors existing timer tests.
    const { result } = renderHook(() => useFocusTimer({ startedAtMs: START_MS, focusSeconds: 1 }));

    // Flush prime .then() before overriding play for the fire-time call.
    await act(async () => {
      await Promise.resolve();
    });

    // Simulate autoplay block: replace play with a rejecting mock on the live audio instance.
    audioStub.instances[0].play = vi.fn().mockRejectedValue(new Error("autoplay blocked"));

    // Advance 1s to trigger focus-end; the timeout fires and calls audioRef.current?.play().
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Flush the .catch(() => {}) microtask (fail-open path).
    await act(async () => {
      await Promise.resolve();
    });

    expect(audioStub.instances[0].play).toHaveBeenCalled(); // fire happened
    expect(result.current.phase).toBe("rating"); // fail-open: rating despite rejection
  });
});
