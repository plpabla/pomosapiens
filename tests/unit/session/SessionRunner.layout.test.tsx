import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import SessionRunner from "@/components/session/SessionRunner";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";

vi.mock("@/lib/timer/useFocusTimer");
const mockedHook = vi.mocked(useFocusTimer);

beforeEach(() => {
  mockedHook.mockReturnValue({
    phase: "running",
    mode: "preset",
    remaining: 1500,
    elapsed: 0,
    stoppedAtMs: null,
    stopEarly: vi.fn(),
    continueAsCountUp: vi.fn(),
    audioRef: { current: null },
  });
});

afterEach(() => {
  cleanup();
});

describe("SessionRunner layout", () => {
  it("forces full viewport height by default (standalone page usage)", () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} />);
    expect(screen.getByText("Focus session").parentElement).toHaveClass("min-h-screen");
  });

  it("omits the min-h-screen constraint when fullHeight is false (embedded usage)", () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} fullHeight={false} />);
    expect(screen.getByText("Focus session").parentElement).not.toHaveClass("min-h-screen");
  });
});
