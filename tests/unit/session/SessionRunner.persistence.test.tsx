import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import SessionRunner from "@/components/session/SessionRunner";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";

vi.mock("@/lib/timer/useFocusTimer");
const mockedHook = vi.mocked(useFocusTimer);

const RATING_HOOK_RESULT = {
  phase: "rating" as const,
  mode: "preset" as const,
  remaining: 0,
  elapsed: 60,
  stoppedAtMs: 1000,
  stopEarly: vi.fn(),
  continueAsCountUp: vi.fn(),
  audioRef: { current: null },
};

beforeEach(() => {
  mockedHook.mockReturnValue(RATING_HOOK_RESULT);
  cleanup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionRunner injected persistence and navigation", () => {
  it("calls the injected persistEnd instead of PATCHing when a rating is chosen", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const persistEnd = vi.fn().mockResolvedValue(undefined);

    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="preset" persistEnd={persistEnd} />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    await waitFor(() => {
      expect(persistEnd).toHaveBeenCalledWith({
        focus_rating: 3,
        ended_at: new Date(1000).toISOString(),
        note: null,
      });
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the injected onGoToDashboard instead of navigating via window.location", async () => {
    const persistEnd = vi.fn().mockResolvedValue(undefined);
    const onGoToDashboard = vi.fn();

    render(
      <SessionRunner
        sessionId="s1"
        startedAtMs={0}
        focusSeconds={60}
        mode="preset"
        persistEnd={persistEnd}
        onGoToDashboard={onGoToDashboard}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /session saved/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /go to dashboard/i }));

    expect(onGoToDashboard).toHaveBeenCalledTimes(1);
  });

  it("calls the injected onStartNewSession instead of navigating via window.location", async () => {
    const persistEnd = vi.fn().mockResolvedValue(undefined);
    const onStartNewSession = vi.fn();

    render(
      <SessionRunner
        sessionId="s1"
        startedAtMs={0}
        focusSeconds={60}
        mode="preset"
        persistEnd={persistEnd}
        onStartNewSession={onStartNewSession}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /session saved/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /start a new session/i }));

    expect(onStartNewSession).toHaveBeenCalledTimes(1);
  });
});
