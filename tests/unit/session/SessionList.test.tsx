import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import SessionList from "@/components/session/SessionList";
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

describe("SessionList readOnly", () => {
  it("forwards readOnly to tiles, hiding mutation actions", () => {
    render(<SessionList sessions={[DONE_SESSION]} error={null} readOnly />);
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("shows mutation actions when readOnly is omitted", () => {
    render(<SessionList sessions={[DONE_SESSION]} error={null} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});
