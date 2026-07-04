import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBreakTimer } from "@/lib/timer/useBreakTimer";
import { stubAudioGlobal, dispatchVisibilityChange, createAudioMock, type AudioMock } from "../_setup";

const BREAK_SECONDS = 60;
const START_MS = 5_000_000;

describe("useBreakTimer", () => {
  let audioStub: ReturnType<typeof stubAudioGlobal>;
  let audioMock: AudioMock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let audioRef: { current: any };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "queueMicrotask"] });
    vi.setSystemTime(START_MS);
    audioStub = stubAudioGlobal();
    audioMock = createAudioMock();
    audioRef = { current: audioMock };
  });

  afterEach(() => {
    audioStub.restore();
    vi.useRealTimers();
  });

  it("counts remaining down from wall clock when started", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useBreakTimer({ breakStartedAtMs: START_MS, breakSeconds: BREAK_SECONDS, audioRef, onComplete }),
    );

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
  });

  it("plays chime and calls onComplete when remaining reaches 0", () => {
    const onComplete = vi.fn();
    renderHook(() => useBreakTimer({ breakStartedAtMs: START_MS, breakSeconds: 1, audioRef, onComplete }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(audioMock.play).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("cancel calls onComplete without playing chime", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useBreakTimer({ breakStartedAtMs: START_MS, breakSeconds: BREAK_SECONDS, audioRef, onComplete }),
    );

    act(() => {
      result.current.cancel();
    });

    expect(audioMock.play).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("visibilitychange reconciles remaining from wall clock", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useBreakTimer({ breakStartedAtMs: START_MS, breakSeconds: BREAK_SECONDS, audioRef, onComplete }),
    );

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    act(() => {
      dispatchVisibilityChange("hidden");
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    act(() => {
      dispatchVisibilityChange("visible");
    });

    expect(result.current.remaining).toBe(25);
  });
});
