import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, within, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ClearHistoryButton from "@/components/anon/ClearHistoryButton";
import { createLocalSession, useLocalSessions, LOCAL_SESSIONS_KEY } from "@/lib/local/localSessions";

const INPUT = {
  energy_level: "medium",
  topic_id: null,
  material_format_id: null,
  timer_mode: "preset_1",
  planned_focus_seconds: 25 * 60,
  planned_break_seconds: 5 * 60,
} as const;

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_SESSIONS_KEY }));
});

afterEach(() => {
  cleanup();
});

describe("ClearHistoryButton", () => {
  it("renders a Clear history trigger and no dialog until clicked", () => {
    render(<ClearHistoryButton />);

    expect(screen.getByRole("button", { name: "Clear history" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a confirmation dialog without clearing sessions on trigger click", async () => {
    createLocalSession(INPUT);
    render(<ClearHistoryButton />);

    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));

    const dialog = await screen.findByRole("dialog", { name: "Clear history?" });
    expect(within(dialog).getByText(/deletes all locally stored sessions/i)).toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_SESSIONS_KEY)).toContain(INPUT.energy_level);
  });

  it("does not clear sessions when the dialog is dismissed via Cancel", async () => {
    createLocalSession(INPUT);
    render(<ClearHistoryButton />);

    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    const dialog = await screen.findByRole("dialog", { name: "Clear history?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(LOCAL_SESSIONS_KEY)).toContain(INPUT.energy_level);
  });

  it("clears all local sessions and closes the dialog when confirmed", async () => {
    createLocalSession(INPUT);
    createLocalSession(INPUT);
    const { result } = renderHook(() => useLocalSessions());
    expect(result.current).toHaveLength(2);

    render(<ClearHistoryButton />);
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    const dialog = await screen.findByRole("dialog", { name: "Clear history?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear history" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(result.current).toHaveLength(0);
    expect(localStorage.getItem(LOCAL_SESSIONS_KEY)).not.toContain(INPUT.energy_level);
  });
});
