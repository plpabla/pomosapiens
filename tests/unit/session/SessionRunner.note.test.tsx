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
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
  cleanup();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionRunner note textarea", () => {
  it("renders a labeled note textarea on the rating screen", () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="preset" />);

    expect(screen.getByLabelText(/add a note/i)).toBeInTheDocument();
  });

  it("sends the trimmed note in the PATCH body when a rating is chosen", async () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="preset" />);

    fireEvent.change(screen.getByLabelText(/add a note/i), { target: { value: "  good focus  " } });
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/sessions/s1",
        expect.objectContaining({
          body: expect.stringContaining('"note":"good focus"') as string,
        }),
      );
    });
  });

  it("sends note: null when the textarea is left empty and Skip is chosen", async () => {
    render(<SessionRunner sessionId="s1" startedAtMs={0} focusSeconds={60} mode="preset" />);

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/sessions/s1",
        expect.objectContaining({
          body: expect.stringContaining('"note":null') as string,
        }),
      );
    });
  });
});
