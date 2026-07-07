import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useTabTitle } from "@/lib/timer/useTabTitle";
import { dispatchVisibilityChange } from "../_setup";

describe("useTabTitle", () => {
  beforeEach(() => {
    document.title = "Session";
  });

  afterEach(() => {
    cleanup();
  });

  it("sets the running focus title", () => {
    renderHook(() => {
      useTabTitle({ title: "⏱ 05:00 – PomoSapiens" });
    });
    expect(document.title).toBe("⏱ 05:00 – PomoSapiens");
  });

  it("sets the running break title", () => {
    renderHook(() => {
      useTabTitle({ title: "🌴 04:59 – PomoSapiens" });
    });
    expect(document.title).toBe("🌴 04:59 – PomoSapiens");
  });

  it("restores the captured default when title is null", () => {
    const { rerender } = renderHook(
      ({ title }: { title: string | null }) => {
        useTabTitle({ title });
      },
      { initialProps: { title: "⏱ 05:00 – PomoSapiens" } },
    );
    expect(document.title).toBe("⏱ 05:00 – PomoSapiens");

    rerender({ title: null });

    expect(document.title).toBe("Session");
  });

  it("restores the captured default on unmount", () => {
    const { unmount } = renderHook(() => {
      useTabTitle({ title: "⏱ 05:00 – PomoSapiens" });
    });
    expect(document.title).toBe("⏱ 05:00 – PomoSapiens");

    unmount();

    expect(document.title).toBe("Session");
  });
});

describe("useTabTitle - alert", () => {
  beforeEach(() => {
    document.title = "Session";
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    dispatchVisibilityChange("visible");
  });

  it("blinks between the alert texts every second while the tab is hidden", () => {
    dispatchVisibilityChange("hidden");

    renderHook(() => {
      useTabTitle({ title: null, alert: ["A", "B"] });
    });
    expect(document.title).toBe("A");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.title).toBe("B");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.title).toBe("A");
  });

  it("stops blinking, restores the default, and fires onAlertDismiss on refocus", () => {
    dispatchVisibilityChange("hidden");
    const onAlertDismiss = vi.fn();

    renderHook(() => {
      useTabTitle({ title: null, alert: ["A", "B"], onAlertDismiss });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.title).toBe("B");

    act(() => {
      dispatchVisibilityChange("visible");
    });

    expect(document.title).toBe("Session");
    expect(onAlertDismiss).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(document.title).toBe("Session");
  });

  it("restores the default and fires onAlertDismiss immediately when the alert starts while visible", () => {
    dispatchVisibilityChange("visible");
    const onAlertDismiss = vi.fn();

    renderHook(() => {
      useTabTitle({ title: null, alert: ["A", "B"], onAlertDismiss });
    });

    expect(document.title).toBe("Session");
    expect(onAlertDismiss).toHaveBeenCalledTimes(1);
  });
});
