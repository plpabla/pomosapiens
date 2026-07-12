import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

describe("SessionTile readOnly", () => {
  it("shows abandon/edit/delete actions by default", () => {
    render(<SessionTile session={DONE_SESSION} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("hides the abandon button in readOnly mode for an in-progress session", () => {
    render(<SessionTile session={IN_PROGRESS_SESSION} readOnly />);
    expect(screen.queryByRole("button", { name: /abandon/i })).not.toBeInTheDocument();
  });

  it("hides edit/delete actions in readOnly mode for a done session", () => {
    render(<SessionTile session={DONE_SESSION} readOnly />);
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });
});
