import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import SessionTile from "@/components/session/SessionTile";
import type { SessionListItem } from "@/lib/types";

afterEach(() => {
  cleanup();
});

const DONE_SESSION: SessionListItem = {
  id: "s1",
  started_at: "2026-07-12T10:00:00.000Z",
  energy_level: "medium",
  duration_seconds: 1500,
  focus_rating: 4,
  ended_at: "2026-07-12T10:25:00.000Z",
  timer_mode: "preset_1",
  note: null,
  topic_id: null,
  material_format_id: null,
  topic: null,
  material_format: null,
};

const IN_PROGRESS_SESSION: SessionListItem = {
  ...DONE_SESSION,
  ended_at: null,
  focus_rating: null,
  duration_seconds: null,
};

describe("SessionTile 🍅 badge", () => {
  it("renders 🍅 as plain text next to the duration for a completed session", () => {
    render(<SessionTile session={DONE_SESSION} />);
    const timeRow = screen.getByText(/25 min\./);
    expect(timeRow.textContent).toContain("🍅");
  });

  it("does not wrap the 🍅 in a chip element", () => {
    const { container } = render(<SessionTile session={DONE_SESSION} />);
    const chips = Array.from(container.querySelectorAll(".bg-charred"));
    expect(chips.every((chip) => !chip.textContent.includes("🍅"))).toBe(true);
  });

  it("shows no 🍅 for an in-progress session", () => {
    render(<SessionTile session={IN_PROGRESS_SESSION} />);
    const timeRow = screen.getByText("In progress");
    expect(timeRow.textContent).not.toContain("🍅");
  });

  it("renders 🍅 per 20-min block for a longer session", () => {
    render(<SessionTile session={{ ...DONE_SESSION, duration_seconds: 2400 }} />);
    const timeRow = screen.getByText(/40 min\./);
    expect(timeRow.textContent).toContain("🍅🍅");
  });
});

describe("SessionTile readOnly", () => {
  it("exposes edit/delete through the actions menu by default", () => {
    render(<SessionTile session={DONE_SESSION} />);
    // Radix's DropdownMenuTrigger opens on pointerdown, not click.
    fireEvent.pointerDown(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("hides the abandon button in readOnly mode for an in-progress session", () => {
    render(<SessionTile session={IN_PROGRESS_SESSION} readOnly />);
    expect(screen.queryByRole("button", { name: /abandon/i })).not.toBeInTheDocument();
  });

  it("hides the actions menu in readOnly mode for a done session", () => {
    render(<SessionTile session={DONE_SESSION} readOnly />);
    expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });
});
