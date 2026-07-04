import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import SessionRunner from "@/components/session/SessionRunner";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";

vi.mock("@/lib/timer/useFocusTimer");
const mockedHook = vi.mocked(useFocusTimer);

const RATING_HOOK_RESULT = {
  phase: "rating" as const,
  remaining: 0,
  elapsed: 60,
  stoppedAtMs: 1000,
  stopEarly: vi.fn(),
  audioRef: { current: null },
};

beforeEach(() => {
  mockedHook.mockReturnValue(RATING_HOOK_RESULT);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
  cleanup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionRunner break-offer phase", () => {
  it("shows break offer after rating PATCH succeeds for preset session with breakSeconds > 0", async () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="preset" breakSeconds={300} />);

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /take a break/i })).toBeInTheDocument();
    });
  });

  it("does not show break offer after rating PATCH when mode is count_up", async () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="count_up" breakSeconds={null} />);

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    // Allow the PATCH to settle -- the component navigates away, no break offer should appear.
    await waitFor(() => {
      expect(screen.queryByText(/take a break/i)).not.toBeInTheDocument();
    });
  });
});
