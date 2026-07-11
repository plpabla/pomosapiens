import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionStart } from "@/lib/session/useSessionStart";
import { stubAudioGlobal } from "../_setup";
import type { SessionPersistence } from "@/lib/session/persistence";

const PRESETS = [
  { slot: 1 as const, focus_seconds: 1500, break_seconds: 300 },
  { slot: 2 as const, focus_seconds: 2700, break_seconds: 600 },
  { slot: 3 as const, focus_seconds: 5400, break_seconds: 900 },
];

function fakeSubmitEvent() {
  return { preventDefault: vi.fn() } as unknown as React.SubmitEvent<HTMLFormElement>;
}

describe("useSessionStart persistence injection", () => {
  it("calls persistence.createSession with the derived payload and passes the result to onStarted", async () => {
    stubAudioGlobal();
    const createSession = vi.fn().mockResolvedValue({ id: "s1", startedAtMs: 123 });
    const persistence: SessionPersistence = { createSession, endSession: vi.fn() };
    const onStarted = vi.fn();

    const { result } = renderHook(() =>
      useSessionStart({
        energy: "medium",
        topicId: "t1",
        materialFormatId: "f1",
        mode: "preset_2",
        presets: PRESETS,
        persistence,
        onStarted,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(fakeSubmitEvent());
    });

    expect(createSession).toHaveBeenCalledWith({
      energy_level: "medium",
      topic_id: "t1",
      material_format_id: "f1",
      timer_mode: "preset_2",
      planned_focus_seconds: 2700,
      planned_break_seconds: 600,
    });
    expect(onStarted).toHaveBeenCalledWith({ id: "s1", startedAtMs: 123 });
  });

  it("sets the error message and does not call onStarted when persistence rejects", async () => {
    stubAudioGlobal();
    const persistence: SessionPersistence = {
      createSession: vi.fn().mockRejectedValue(new Error("Failed to start session")),
      endSession: vi.fn(),
    };
    const onStarted = vi.fn();

    const { result } = renderHook(() =>
      useSessionStart({
        energy: "low",
        topicId: null,
        materialFormatId: null,
        mode: "count_up",
        presets: PRESETS,
        persistence,
        onStarted,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(fakeSubmitEvent());
    });

    expect(result.current.error).toBe("Failed to start session");
    expect(onStarted).not.toHaveBeenCalled();
  });
});
