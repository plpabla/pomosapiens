import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import SessionRunner from "@/components/session/SessionRunner";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";

vi.mock("@/lib/timer/useFocusTimer");
const mockedHook = vi.mocked(useFocusTimer);

const BASE_HOOK_RESULT = {
  phase: "running" as const,
  remaining: 57,
  elapsed: 3,
  stoppedAtMs: null,
  stopEarly: vi.fn(),
  audioRef: { current: null },
};

describe("SessionRunner count_up mode rendering", () => {
  beforeEach(() => {
    mockedHook.mockImplementation(({ mode = "preset" }) => ({
      ...BASE_HOOK_RESULT,
      mode,
      continueAsCountUp: vi.fn(),
    }));
    cleanup();
  });

  it("shows 'Count-up session' label when mode is count_up", () => {
    render(<SessionRunner sessionId="x" startedAtMs={0} focusSeconds={60} mode="count_up" />);
    expect(screen.getByText(/count-up session/i)).toBeInTheDocument();
  });

  it("displays elapsed time (not remaining) in count_up mode", () => {
    // hook returns elapsed=3, remaining=57; count_up should display 00:03, not 00:57
    render(<SessionRunner sessionId="x" startedAtMs={0} focusSeconds={60} mode="count_up" />);
    expect(screen.getByText("00:03")).toBeInTheDocument();
    expect(screen.queryByText("00:57")).not.toBeInTheDocument();
  });

  it("shows a 'Stop' button (not 'Stop early') in count_up mode", () => {
    render(<SessionRunner sessionId="x" startedAtMs={0} focusSeconds={60} mode="count_up" />);
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop early/i })).not.toBeInTheDocument();
  });

  it("shows a 'Stop early' button in preset mode", () => {
    render(<SessionRunner sessionId="x" startedAtMs={0} focusSeconds={60} mode="preset" />);
    expect(screen.getByRole("button", { name: /stop early/i })).toBeInTheDocument();
  });
});
