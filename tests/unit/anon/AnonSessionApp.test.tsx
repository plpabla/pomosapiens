import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import AnonSessionApp from "@/components/anon/AnonSessionApp";
import { useFocusTimer } from "@/lib/timer/useFocusTimer";
import { createLocalSession, endLocalSession, LOCAL_SESSIONS_KEY } from "@/lib/local/localSessions";
import { stubAudioGlobal } from "../_setup";

vi.mock("@/lib/timer/useFocusTimer");
const mockedHook = vi.mocked(useFocusTimer);

const RUNNING_HOOK_RESULT = {
  phase: "running" as const,
  remaining: 1500,
  elapsed: 0,
  stoppedAtMs: null,
  stopEarly: vi.fn(),
  audioRef: { current: null },
};

const RATING_HOOK_RESULT = {
  phase: "rating" as const,
  remaining: 0,
  elapsed: 60,
  stoppedAtMs: 1000,
  stopEarly: vi.fn(),
  audioRef: { current: null },
};

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_SESSIONS_KEY }));
  mockedHook.mockReturnValue(RUNNING_HOOK_RESULT);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AnonSessionApp", () => {
  it("renders the picker form when no local session is in progress", () => {
    render(<AnonSessionApp />);
    expect(screen.getByRole("heading", { name: /choose your energy level/i })).toBeInTheDocument();
  });

  it("resumes into the runner view when a local session is already in progress at mount", async () => {
    createLocalSession({
      energy_level: "medium",
      topic_id: null,
      material_format_id: null,
      timer_mode: "preset_1",
      planned_focus_seconds: 1500,
      planned_break_seconds: 300,
    });

    render(<AnonSessionApp />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop early/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /choose your energy level/i })).not.toBeInTheDocument();
  });

  it("starting a session from the picker transitions straight to the runner, with no navigation", async () => {
    stubAudioGlobal();
    render(<AnonSessionApp />);

    fireEvent.click(screen.getByRole("button", { name: "Medium" }));
    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop early/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /choose your energy level/i })).not.toBeInTheDocument();
  });

  it("returns to a reset picker after rating a session and starting a new one", async () => {
    createLocalSession({
      energy_level: "low",
      topic_id: null,
      material_format_id: null,
      timer_mode: "preset_1",
      planned_focus_seconds: 1500,
      planned_break_seconds: 300,
    });
    mockedHook.mockReturnValue(RATING_HOOK_RESULT);

    render(<AnonSessionApp />);

    fireEvent.click(await screen.findByRole("button", { name: /skip/i }));
    fireEvent.click(await screen.findByRole("button", { name: /start a new session/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /choose your energy level/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /start/i })).toBeEnabled();
  });

  it("auto-selects a topic created inline, showing its name in the Topic select, and keeps it selected", async () => {
    render(<AnonSessionApp />);

    fireEvent.click(screen.getByRole("button", { name: /new topic/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Deep Work" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent("Deep Work");
    });

    // The selection must not revert once Radix's internal effects settle --
    // regression for a freshly created topic never having been rendered inside
    // the (unopened) dropdown.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent("Deep Work");
  });

  describe("local history", () => {
    it("does not render a history section when there are no local sessions", () => {
      render(<AnonSessionApp />);

      expect(screen.queryByText(/★ \d \/ 5/)).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /history/i })).not.toBeInTheDocument();
    });

    it("shows a read-only history entry for a completed session, with no mutation controls", () => {
      const row = createLocalSession({
        energy_level: "high",
        topic_id: null,
        material_format_id: null,
        timer_mode: "preset_1",
        planned_focus_seconds: 1500,
        planned_break_seconds: 300,
      });
      endLocalSession(row.id, {
        focus_rating: 5,
        ended_at: new Date(Date.parse(row.started_at) + 1_500_000).toISOString(),
        note: "great focus",
      });

      render(<AnonSessionApp />);

      expect(screen.getByRole("heading", { name: /history/i })).toBeInTheDocument();
      expect(screen.getByText("★ 5 / 5")).toBeInTheDocument();
      expect(screen.getByText("great focus")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /abandon/i })).not.toBeInTheDocument();
    });
  });
});
