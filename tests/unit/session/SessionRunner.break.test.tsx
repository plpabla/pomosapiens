import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import SessionRunner from "@/components/session/SessionRunner";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { useBreakTimer } from "@/lib/timer/useBreakTimer";
import { dispatchVisibilityChange } from "../_setup";

vi.mock("@/lib/timer/useFocusTimer");
vi.mock("@/lib/timer/useBreakTimer");
const mockedHook = vi.mocked(useFocusTimer);
const mockedBreakHook = vi.mocked(useBreakTimer);

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

let breakOnComplete: () => void = () => {
  /* replaced in beforeEach */
};

beforeEach(() => {
  mockedHook.mockReturnValue(RATING_HOOK_RESULT);
  mockedBreakHook.mockImplementation(({ onComplete }) => {
    breakOnComplete = onComplete;
    return { remaining: 0, cancel: vi.fn() };
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
  cleanup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderAndStartBreak() {
  render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="preset" breakSeconds={300} />);
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /session saved/i })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("button", { name: /take a break/i }));
}

describe("SessionRunner session-saved summary", () => {
  it("shows a Take a break button on the saved summary for preset session with breakSeconds > 0", async () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="preset" breakSeconds={300} />);

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /session saved/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /take a break/i })).toBeInTheDocument();
  });

  it("does not show a Take a break button on the saved summary when mode is count_up", async () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="count_up" breakSeconds={null} />);

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /session saved/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /take a break/i })).not.toBeInTheDocument();
  });
});

describe("SessionRunner break completion navigation", () => {
  let assignSpy: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignSpy },
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("defers navigation and blinks the title when the break completes on a hidden tab", async () => {
    await renderAndStartBreak();

    dispatchVisibilityChange("hidden");
    act(() => {
      breakOnComplete();
    });

    expect(assignSpy).not.toHaveBeenCalled();
    expect(document.title).toBe("Break over!");
  });

  it("navigates to the dashboard once the tab is refocused after a hidden break completion", async () => {
    await renderAndStartBreak();

    dispatchVisibilityChange("hidden");
    act(() => {
      breakOnComplete();
    });
    act(() => {
      dispatchVisibilityChange("visible");
    });

    expect(assignSpy).toHaveBeenCalledWith("/dashboard");
  });

  it("navigates immediately when the break completes on a visible tab (unchanged behavior)", async () => {
    await renderAndStartBreak();

    act(() => {
      breakOnComplete();
    });

    expect(assignSpy).toHaveBeenCalledWith("/dashboard");
  });
});
