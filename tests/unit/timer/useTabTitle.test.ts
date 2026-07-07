import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useTabTitle } from "@/lib/timer/useTabTitle";

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
